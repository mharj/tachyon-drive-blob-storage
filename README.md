# tachyon-drive-blob-storage

## Azure Blob storage driver implementation

### Initialize simple JSON Azure Blob storage driver

```typescript
const driver = new AzureBlobStorageDriver('AzureBlobStorageDriver', connectionString, 'container', 'store.json', bufferSerializer);
```

### Initialize crypt processor with JSON Azure Blob storage driver

```typescript
// requires install tachyon-drive-node-fs
const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));
const driver = new AzureBlobStorageDriver('CryptAzureBlobStorageDriver', connectionString, 'container', 'store.aes', bufferSerializer, processor);
```

### see more on NPMJS [tachyon-drive](https://www.npmjs.com/package/tachyon-drive)