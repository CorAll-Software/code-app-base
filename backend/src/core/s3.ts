import { S3Client, write } from "bun";
import { configServer } from "src/config";

export const client = new S3Client({
    endpoint: configServer.s3.baseUrl,
    accessKeyId: configServer.s3.accessKeyId,
    secretAccessKey: configServer.s3.secretAccessKey,
    bucket: configServer.s3.bucketName,
});

export const clientPublic = new S3Client({
    endpoint: configServer.s3.baseUrl,
    accessKeyId: configServer.s3.accessKeyId,
    secretAccessKey: configServer.s3.secretAccessKey,
    bucket: configServer.s3.bucketNamePublic,
});

export const getS3ObjectUrl = (key: string) => {
    return client.presign(key, {
        expiresIn: configServer.s3.expiresIn,
        acl: 'public-read'
    })
};

export const s3FileExists = async (key: string): Promise<boolean> => {
    const url = client.presign(key, { expiresIn: 60, method: 'HEAD' })
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
};

export const uploadToS3Private = async (key: string, data: Buffer | Uint8Array | Blob | string): Promise<boolean> => {
    const file = client.file(key);
    const res = await write(file, data);
    return !!res;
}

export const uploadToS3Public = async (key: string, data: Buffer | Uint8Array | Blob | string): Promise<boolean> => {
    const file = clientPublic.file(key, { acl: 'public-read' });
    const res = await write(file, data);
    return !!res;
}

export const deleteFromS3Private = async (key: string): Promise<boolean> => {
    try {
        await client.file(key).delete();
        return true;
    } catch {
        return false;
    }
}

export const buildKeyObject = (path: string, fileName: string) => {
    const ext = fileName.includes('.') ? fileName.split('.').pop() : ''
    const safeExt = ext ? `.${ext.toLowerCase()}` : ''
    const file = `${Date.now()}-${crypto.randomUUID()}${safeExt}`
    return {
        file,
        filePath: `${path}${file}`
    }
}