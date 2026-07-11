declare module 'qcloud-cos-sts' {
  interface Statement {
    action: string[];
    effect: 'allow' | 'deny';
    resource: string[];
  }
  interface Policy {
    version: string;
    statement: Statement[];
  }
  interface GetCredentialOptions {
    secretId: string;
    secretKey: string;
    durationSeconds?: number;
    policy: Policy;
  }
  interface CredentialData {
    credentials: { tmpSecretId: string; tmpSecretKey: string; sessionToken: string };
    startTime: number;
    expiredTime: number;
    requestId?: string;
  }
  interface STS {
    getCredential(
      options: GetCredentialOptions,
      callback: (err: Error | null, data: CredentialData) => void,
    ): void;
    getPolicy(scopes: unknown): Policy;
  }
  const sts: STS;
  export default sts;
}
