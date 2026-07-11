import { useRef } from 'react';
import { ProTable, ModalForm, ProFormText, type ActionType, type ProColumns } from '@ant-design/pro-components';
import { Button, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { apiGet, apiSend } from '@/services/api';

interface AdminRow {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

export default function Admins() {
  const ref = useRef<ActionType>();
  const intl = useIntl();
  const columns: ProColumns<AdminRow>[] = [
    { title: intl.formatMessage({ id: 'admins.username' }), dataIndex: 'username' },
    { title: intl.formatMessage({ id: 'admins.role' }), dataIndex: 'role', render: (_, r) => <Tag color="purple">{r.role}</Tag> },
    { title: intl.formatMessage({ id: 'admins.createdAt' }), dataIndex: 'createdAt', valueType: 'dateTime' },
    {
      title: intl.formatMessage({ id: 'admins.actions' }),
      valueType: 'option',
      render: (_, r) => [
        <Popconfirm key="del" title={intl.formatMessage({ id: 'admins.delete.confirm' })} onConfirm={async () => {
          try { await apiSend('DELETE', `/admin/users/${r.id}`); message.success(intl.formatMessage({ id: 'admins.deleted' })); ref.current?.reload(); }
          catch (e) { message.error((e as Error).message); }
        }}>
          <Button size="small" type="link" danger>{intl.formatMessage({ id: 'admins.delete' })}</Button>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <ProTable<AdminRow>
      headerTitle={intl.formatMessage({ id: 'admins.title' })}
      actionRef={ref}
      rowKey="id"
      search={false}
      columns={columns}
      request={async () => {
        const data = await apiGet<AdminRow[]>('/admin/users');
        return { data, success: true };
      }}
      toolBarRender={() => [
        <ModalForm
          key="add"
          title={intl.formatMessage({ id: 'admins.add.title' })}
          trigger={<Button type="primary" icon={<PlusOutlined />}>{intl.formatMessage({ id: 'admins.add' })}</Button>}
          onFinish={async (v: { username: string; password: string }) => {
            try {
              await apiSend('POST', '/admin/users', v);
              message.success(intl.formatMessage({ id: 'admins.add.success' }));
              ref.current?.reload();
              return true;
            } catch (e) {
              message.error((e as Error).message === 'username_taken' ? intl.formatMessage({ id: 'admins.add.usernameTaken' }) : intl.formatMessage({ id: 'admins.add.failed' }));
              return false;
            }
          }}
        >
          <ProFormText name="username" label={intl.formatMessage({ id: 'admins.username' })} rules={[{ required: true, min: 3 }]} />
          <ProFormText.Password name="password" label={intl.formatMessage({ id: 'admins.add.password' })} rules={[{ required: true, min: 6 }]} />
        </ModalForm>,
      ]}
    />
  );
}
