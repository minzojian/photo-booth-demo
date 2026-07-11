/**
 * 上传协议类型。
 *
 * 前台通过 POST /sts 获取 StorageProvider 签发的上传凭证，
 * 然后用平台对应的 SDK（当前为 COS SDK sliceUploadFile）直传。
 * 成功后调用 POST /photos 创建订单。
 */

/** 单张照片的元数据。 */
export interface PhotoMeta {
  clientPhotoId: string;
  deviceId: string;
  filename: string;
  size: number;
  sha256: string;
  contentType: string;
  capturedAt: number;
}

