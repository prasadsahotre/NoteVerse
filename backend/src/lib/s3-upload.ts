import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { s3Client, S3_BUCKET_NAME } from './s3.js'

export const uploadToS3 = async (
  key: string,
  buffer: Buffer,
  contentType: string,
) => {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })

  await s3Client.send(command)
}

export const deleteFromS3 = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  })

  await s3Client.send(command)
}

export const generatePresignedDownloadUrl = async (
  key: string,
  expiresIn = 900,
) => {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  })

  return getSignedUrl(s3Client, command, {
    expiresIn,
  })
}
