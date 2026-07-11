import { useRef } from 'react';
import { ProTable, ModalForm, ProFormText, type ActionType, type ProColumns } from '@ant-design/pro-components';
import { Button, Space, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, LockOutlined, UnlockOutlined, PoweroffOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { apiGet, apiSend } from '@/services/api';

interface DeviceRow {
  id: string;
  name: string;
  location?: string;
  appVersion: string;
  online: boolean;
  liveStatus: string;
}

export default function Devices() {
  const ref = useRef<ActionType>();
  const intl = useIntl();

  async function sendCmd(id: string, type: string) {
    try {
      const r = await apiSend<{ delivered: boolean }>('POST', `/devices/${id}/commands`, { type });
      const delivered = r.delivered
        ? intl.formatMessage({ id: 'devices.cmd.online' })
        : intl.formatMessage({ id: 'devices.cmd.offline' });
      message.success(`${intl.formatMessage({ id: 'devices.cmd.sent' }, { type })}（${delivered}）`);
    } catch {
      message.error(intl.formatMessage({ id: 'devices.cmd.failed' }));
    }
  }

  const columns: ProColumns<DeviceRow>[] = [
    { title: intl.formatMessage({ id: 'devices.id' }), dataIndex: 'id', copyable: true },
    { title: intl.formatMessage({ id: 'devices.name' }), dataIndex: 'name' },
    { title: intl.formatMessage({ id: 'devices.location' }), dataIndex: 'location' },
    { title: intl.formatMessage({ id: 'devices.version' }), dataIndex: 'appVersion', width: 90 },
    {
      title: intl.formatMessage({ id: 'devices.status' }),
      dataIndex: 'online',
      render: (_, r) =>
        r.online ? <Tag color="green">{intl.formatMessage({ id: 'devices.online' })} · {r.liveStatus}</Tag> : <Tag>{intl.formatMessage({ id: 'devices.offline' })}</Tag>,
    },
    {
      title: intl.formatMessage({ id: 'devices.actions' }),
      valueType: 'option',
      width: 320,
      render: (_, r) => [
        <Button key="lock" size="small" icon={<LockOutlined />} onClick={() => sendCmd(r.id, 'LOCK')}>{intl.formatMessage({ id: 'devices.lock' })}</Button>,
        <Button key="unlock" size="small" icon={<UnlockOutlined />} onClick={() => sendCmd(r.id, 'UNLOCK')}>{intl.formatMessage({ id: 'devices.unlock' })}</Button>,
        <Button key="shutdown" size="small" danger icon={<PoweroffOutlined />} onClick={() => sendCmd(r.id, 'SHUTDOWN')}>{intl.formatMessage({ id: 'devices.shutdown' })}</Button>,
        <Popconfirm key="del" title={intl.formatMessage({ id: 'devices.delete.confirm' })} onConfirm={async () => { await apiSend('DELETE', `/devices/${r.id}`); message.success(intl.formatMessage({ id: 'devices.deleted' })); ref.current?.reload(); }}>
          <Button size="small" type="link" danger>{intl.formatMessage({ id: 'devices.delete' })}</Button>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <ProTable<DeviceRow>
      headerTitle={intl.formatMessage({ id: 'devices.title' })}
      actionRef={ref}
      rowKey="id"
      search={false}
      columns={columns}
      request={async () => {
        const data = await apiGet<DeviceRow[]>('/devices');
        return { data, success: true };
      }}
      toolBarRender={() => [
        <ModalForm
          key="add"
          title="添加设备"
          trigger={<Button type="primary" icon={<PlusOutlined />}>添加设备</Button>}
          onFinish={async (v: { id: string; name: string; location?: string }) => {
            try {
              await apiSend('POST', '/devices', v);
              message.success('已添加');
              ref.current?.reload();
              return true;
            } catch (e) {
              message.error((e as Error).message === 'device_exists' ? '设备ID已存在' : '添加失败');
              return false;
            }
          }}
        >
          <ProFormText name="id" label="设备ID" placeholder="如 kiosk-sz-004" rules={[{ required: true }]} />
          <ProFormText name="name" label="设备名称" rules={[{ required: true }]} />
          <ProFormText name="location" label="位置" />
        </ModalForm>,
      ]}
    />
  );
}
