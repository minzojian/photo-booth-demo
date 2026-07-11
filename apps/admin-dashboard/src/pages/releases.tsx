import { useState, useRef } from 'react';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Modal, Form, Input, Select, Upload, message, Popconfirm, Switch, Typography } from 'antd';
import { UploadOutlined, CloudUploadOutlined, CopyOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { apiGet, apiSend } from '@/services/api';
import { getUploader } from '@/uploader';
import type { UploadCredentials } from '@/uploader';

interface ReleaseRow {
  id: string;
  version: string;
  platform: string;
  arch: string;
  filename: string;
  size: number;
  cosKey: string;
  blockmapCosKey?: string | null;
  releaseNotes?: string | null;
  enabled: boolean;
  createdAt: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
};
const ARCH_LABELS: Record<string, string> = { arm64: 'ARM64 (Apple Silicon)', x64: 'x64 (Intel/AMD)' };

/** 使用 Web Crypto API 计算文件 SHA-512（electron-updater 需要 base64） */
async function sha512Base64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-512', buf);
  let binary = '';
  for (const b of new Uint8Array(hash)) binary += String.fromCharCode(b);
  return btoa(binary);
}

export default function Releases() {
  const intl = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pctZip, setPctZip] = useState(0);
  const [pctBm, setPctBm] = useState(0);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [bmFile, setBmFile] = useState<File | null>(null);
  const [form] = Form.useForm();
  const tableRef = useRef<{ reload: () => void }>(null);

  const resetModal = () => {
    form.resetFields();
    setZipFile(null);
    setBmFile(null);
    setPctZip(0);
    setPctBm(0);
  };

  const localDateFormatter = new Intl.DateTimeFormat(navigator.language, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZoneName: 'short',
  });

  function formatCreatedAt(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    const abs = localDateFormatter.format(d);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return `${abs} (${intl.formatMessage({ id: 'releases.time.justNow' })})`;
    if (diffMin < 60) return `${abs} (${intl.formatMessage({ id: 'releases.time.minutesAgo' }, { n: diffMin })})`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${abs} (${intl.formatMessage({ id: 'releases.time.hoursAgo' }, { n: diffHour })})`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${abs} (${intl.formatMessage({ id: 'releases.time.daysAgo' }, { n: diffDay })})`;
    return abs;
  }

  const columns: ProColumns<ReleaseRow>[] = [
    { title: intl.formatMessage({ id: 'releases.version' }), dataIndex: 'version', width: 100 },
    {
      title: intl.formatMessage({ id: 'releases.platform' }),
      dataIndex: 'platform',
      width: 100,
      render: (_, r) => PLATFORM_LABELS[r.platform] || r.platform,
    },
    {
      title: intl.formatMessage({ id: 'releases.arch' }),
      dataIndex: 'arch',
      width: 140,
      render: (_, r) => ARCH_LABELS[r.arch] || r.arch,
    },
    {
      title: intl.formatMessage({ id: 'releases.filename' }),
      dataIndex: 'filename',
      ellipsis: true,
      render: (_, r) => {
        const url = (window as any).__CDN_BASE__ || 'https://static.lunastudio.cn/';
        const fullUrl = url + r.cosKey;
        return (
          <Typography.Text
            copyable={{
              text: fullUrl,
              icon: [<CopyOutlined key="copy" />, <CopyOutlined key="copied" />],
              tooltips: false,
            }}
            style={{ cursor: 'pointer' }}
            onClick={() => {
              navigator.clipboard.writeText(fullUrl);
              message.success('已复制完整下载链接');
            }}
          >
            {r.filename}
          </Typography.Text>
        );
      },
    },
    { title: intl.formatMessage({ id: 'releases.size' }), dataIndex: 'size', width: 90, render: (_, r) => `${(r.size / 1024 / 1024).toFixed(1)} MB` },
    {
      title: intl.formatMessage({ id: 'releases.createdAt' }),
      dataIndex: 'createdAt',
      width: 260,
      render: (_, r) => formatCreatedAt(r.createdAt),
    },
    {
      title: intl.formatMessage({ id: 'releases.status' }),
      dataIndex: 'enabled',
      width: 80,
      render: (_, r) => (
        <Switch
          checked={r.enabled}
          onChange={() => handleToggle(r)}
        />
      ),
    },
    {
      title: intl.formatMessage({ id: 'releases.actions' }),
      width: 80,
      render: (_, r) => (
        <Popconfirm title={intl.formatMessage({ id: 'releases.delete.confirm' })} onConfirm={() => handleDelete(r.id)}>
          <a style={{ color: '#ff4d4f' }}>{intl.formatMessage({ id: 'releases.delete' })}</a>
        </Popconfirm>
      ),
    },
  ];

  const handleDelete = async (id: string) => {
    await apiSend('DELETE', `/releases/${id}`);
    message.success(intl.formatMessage({ id: 'releases.deleted' }));
    tableRef.current?.reload();
  };

  const handleToggle = async (row: ReleaseRow) => {
    await apiSend('PATCH', `/releases/${row.id}/toggle`);
    message.success(intl.formatMessage({ id: 'releases.toggle.success' }));
    tableRef.current?.reload();
  };

  const handleUpload = async () => {
    const values = await form.validateFields();
    if (!zipFile) {
      message.warning(intl.formatMessage({ id: 'releases.upload.zip' }));
      return;
    }

    setUploading(true);
    setPctZip(0);
    setPctBm(0);
    try {
      // 1) 获取 STS 凭证
      const cred: UploadCredentials = await apiSend('POST', '/sts/admin', { scope: 'updates' });

      // 2) 直传 zip 到 COS
      const uploader = getUploader(cred.platform);
      const cosKey = await uploader.upload(zipFile, cred, setPctZip);

      // 3) 直传 blockmap（如有）
      let blockmapCosKey: string | undefined;
      if (bmFile) {
        blockmapCosKey = await uploader.upload(bmFile, cred, setPctBm);
      }

      // 4) 计算 sha512
      const sha512 = await sha512Base64(zipFile);

      // 5) 创建 Release 记录
      await apiSend('POST', '/releases', {
        version: values.version,
        platform: values.platform,
        arch: values.arch,
        filename: zipFile.name,
        size: zipFile.size,
        sha512,
        cosKey,
        blockmapCosKey,
        releaseNotes: values.releaseNotes,
      });

      message.success(`v${values.version} ${intl.formatMessage({ id: 'releases.toggle.success' })}`);
      setModalOpen(false);
      resetModal();
      tableRef.current?.reload();
    } catch (e: unknown) {
      message.error((e as Error).message || intl.formatMessage({ id: 'common.error' }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <ProTable<ReleaseRow>
        columns={columns}
        actionRef={tableRef as never}
        cardBordered
        request={async () => {
          const list = await apiGet<ReleaseRow[]>('/releases');
          return { data: list, success: true, total: list.length };
        }}
        rowKey="id"
        search={false}
        toolBarRender={() => [
          <Button key="upload" type="primary" icon={<CloudUploadOutlined />} onClick={() => setModalOpen(true)}>
            {intl.formatMessage({ id: 'releases.new' })}
          </Button>,
        ]}
      />

      <Modal
        title={intl.formatMessage({ id: 'releases.new.title' })}
        open={modalOpen}
        onCancel={() => { if (!uploading) { setModalOpen(false); resetModal(); } }}
        onOk={handleUpload}
        confirmLoading={uploading}
        cancelButtonProps={{ disabled: uploading }}
        maskClosable={!uploading}
        okText={intl.formatMessage({ id: 'releases.submit' })}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} disabled={uploading}>
          <Form.Item name="version" label={intl.formatMessage({ id: 'releases.version' })} rules={[{ required: true }]}>
            <Input placeholder="e.g. 1.0.1" />
          </Form.Item>
          <Form.Item name="platform" label={intl.formatMessage({ id: 'releases.platform' })} rules={[{ required: true }]} initialValue="darwin">
            <Select options={Object.entries(PLATFORM_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item name="arch" label={intl.formatMessage({ id: 'releases.arch' })} rules={[{ required: true }]} initialValue="arm64">
            <Select options={Object.entries(ARCH_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <div style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 8, color: 'rgba(0,0,0,.88)', fontSize: 14 }}>{intl.formatMessage({ id: 'releases.upload.zip' })} <span style={{ color: '#ff4d4f' }}>*</span></div>
            <Upload
              accept=".zip"
              maxCount={1}
              beforeUpload={() => false}
              disabled={uploading}
              showUploadList={uploading ? { showRemoveIcon: false, showPreviewIcon: false } : undefined}
              fileList={zipFile ? [{ uid: '-1', name: zipFile.name, status: 'done' as const }] : []}
              onChange={(info) => setZipFile(info.fileList[0]?.originFileObj ?? null)}
            >
              <Button icon={<UploadOutlined />} disabled={uploading}>{intl.formatMessage({ id: 'releases.upload.zip' })}</Button>
            </Upload>
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 8, color: 'rgba(0,0,0,.88)', fontSize: 14 }}>{intl.formatMessage({ id: 'releases.upload.blockmap' })}</div>
            <Upload
              accept=".blockmap"
              maxCount={1}
              beforeUpload={() => false}
              disabled={uploading}
              showUploadList={uploading ? { showRemoveIcon: false, showPreviewIcon: false } : undefined}
              fileList={bmFile ? [{ uid: '-1', name: bmFile.name, status: 'done' as const }] : []}
              onChange={(info) => setBmFile(info.fileList[0]?.originFileObj ?? null)}
            >
              <Button icon={<UploadOutlined />} disabled={uploading}>{intl.formatMessage({ id: 'releases.upload.blockmap' })}</Button>
            </Upload>
          </div>
          <Form.Item name="releaseNotes" label={intl.formatMessage({ id: 'releases.releaseNotes' })} rules={[{ required: true, message: '请填写更新日志' }]}>
            <Input.TextArea rows={3} placeholder={intl.formatMessage({ id: 'releases.releaseNotes.placeholder' })} />
          </Form.Item>
          {uploading && (
            <div style={{ color: '#1677ff', fontSize: 13 }}>
              {intl.formatMessage({ id: 'releases.uploading' })}{pctZip > 0 && ` ${pctZip}%`}
              {pctBm > 0 && ` · blockmap ${pctBm}%`}
            </div>
          )}
        </Form>
      </Modal>
    </>
  );
}
