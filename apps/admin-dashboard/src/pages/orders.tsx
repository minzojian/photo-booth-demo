import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Tag } from 'antd';
import { useIntl } from '@umijs/max';
import { apiGet } from '@/services/api';

interface OrderRow {
  orderId: string;
  deviceId: string;
  deviceName: string;
  filename: string;
  size: number;
  status: string;
  cosKey?: string | null;
  storagePath?: string | null;
  previewUrl?: string | null;
  capturedAt: string;
  createdAt: string;
}

export default function Orders() {
  const intl = useIntl();
  const columns: ProColumns<OrderRow>[] = [
    { title: intl.formatMessage({ id: 'orders.id' }), dataIndex: 'orderId', copyable: true, ellipsis: true, width: 180 },
    { title: intl.formatMessage({ id: 'orders.device' }), dataIndex: 'deviceName', render: (_, r) => `${r.deviceName} (${r.deviceId})` },
    {
      title: intl.formatMessage({ id: 'orders.file' }),
      dataIndex: 'filename',
      render: (_, r) =>
        r.previewUrl ? (
          <a href={r.previewUrl} target="_blank" rel="noopener noreferrer" title={r.filename}>
            {r.filename}
          </a>
        ) : (
          r.filename
        ),
    },
    { title: intl.formatMessage({ id: 'orders.size' }), dataIndex: 'size', render: (_, r) => `${(r.size / 1024).toFixed(0)} KB` },
    {
      title: intl.formatMessage({ id: 'orders.storage' }),
      dataIndex: 'cosKey',
      render: (_, r) => (r.cosKey ? <Tag color="blue">{intl.formatMessage({ id: 'orders.storage.cos' })}</Tag> : <Tag>{intl.formatMessage({ id: 'orders.storage.local' })}</Tag>),
    },
    { title: intl.formatMessage({ id: 'orders.status' }), dataIndex: 'status', render: (_, r) => <Tag color={r.status === 'completed' ? 'green' : 'orange'}>{r.status}</Tag> },
    { title: intl.formatMessage({ id: 'orders.capturedAt' }), dataIndex: 'createdAt', valueType: 'dateTime' },
  ];

  return (
    <ProTable<OrderRow>
      headerTitle={intl.formatMessage({ id: 'orders.title' })}
      rowKey="orderId"
      search={false}
      columns={columns}
      request={async () => {
        const data = await apiGet<OrderRow[]>('/photos');
        return { data, success: true };
      }}
    />
  );
}
