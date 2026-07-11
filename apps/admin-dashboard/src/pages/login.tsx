import { LoginForm, ProFormText } from '@ant-design/pro-components'
import { UserOutlined, LockOutlined, CameraOutlined } from '@ant-design/icons'
import { history, useIntl } from '@umijs/max'
import { message } from 'antd'
import { login } from '@/services/api'

export default function Login() {
  const intl = useIntl();
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg,#f5f3ff,#fce7f3)',
        boxSizing: 'border-box',
        padding: 24,
        overflow: 'hidden',
      }}>
      <div
        style={{
          maxWidth: '100%',
          background: '#fff',
          padding: 40,
          borderRadius: 16,
          boxShadow: '0 12px 40px rgba(124,58,237,.15)',
          boxSizing: 'border-box',
        }}>
        <LoginForm
          logo={<CameraOutlined style={{ fontSize: 44, color: '#7c3aed' }} />}
          title={intl.formatMessage({ id: 'login.title' })}
          subTitle={intl.formatMessage({ id: 'login.subtitle' })}
          onFinish={async (v: { username: string; password: string }) => {
            try {
              const r = await login(v.username, v.password)
              localStorage.setItem('admin_token', r.token)
              message.success(intl.formatMessage({ id: 'login.success' }))
              history.push('/devices')
              return true
            } catch (e) {
              message.error((e as Error).message)
              return false
            }
          }}>
          <ProFormText
            name="username"
            fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
            placeholder={intl.formatMessage({ id: 'login.username.placeholder' })}
            rules={[{ required: true }]}
          />
          <ProFormText.Password
            name="password"
            fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
            placeholder={intl.formatMessage({ id: 'login.password.placeholder' })}
            rules={[{ required: true }]}
          />
        </LoginForm>
      </div>
    </div>
  )
}
