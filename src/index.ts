import {BlobServiceClient, BlockBlobClient, ContainerClient} from '@azure/storage-blob';
import {IExternalNotify, IPersistSerializer, IStoreProcessor, StorageDriver} from 'tachyon-drive';
import type {ILoggerLike} from '@avanio/logger-like';

type StringOrAsyncString = string | (() => Promise<string>);

export class AzureBlobStorageDriver<Input> extends StorageDriver<Input, Buffer> {
	private readonly connectionString: StringOrAsyncString;
	private readonly containerName: StringOrAsyncString;
	private readonly fileName: StringOrAsyncString;

	private blobServiceClient: BlobServiceClient | undefined;
	private containerClient: ContainerClient | undefined;
	private blockBlobClient: BlockBlobClient | undefined;

	/**
	 * AzureBlobStorageDriver
	 * @param name - name of the driver
	 * @param connectionString - Azure Blob Storage connection string or aync function to get connection string
	 * @param containerName  - Azure Blob Storage container name or async function to get container name
	 * @param fileName - Azure Blob Storage file name or async function to get file name
	 * @param serializer - serializer to serialize and deserialize data (to and from Buffer)
	 * @param extNotify - optional external notify service to notify store update events
	 * @param processor - optional processor to process data (encrypt, decrypt, compress, decompress, etc.)
	 * @param logger - optional logger
	 */
	constructor(
		name: string,
		connectionString: StringOrAsyncString,
		containerName: StringOrAsyncString,
		fileName: StringOrAsyncString,
		serializer: IPersistSerializer<Input, Buffer>,
		extNotify?: IExternalNotify,
		processor?: IStoreProcessor<Buffer>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, extNotify || null, processor, logger);
		this.containerName = containerName;
		this.fileName = fileName;
		this.connectionString = connectionString;
	}

	protected async handleInit(): Promise<boolean> {
		const containerClient = await this.getContainerClient();
		await containerClient.createIfNotExists();
		return true;
	}

	protected async handleUnload(): Promise<boolean> {
		this.containerClient = undefined;
		this.blockBlobClient = undefined;
		this.blobServiceClient = undefined;
		return true;
	}

	protected async handleStore(buffer: Buffer): Promise<void> {
		const blockBlobClient = await this.getBlockBlobClient();
		await blockBlobClient.upload(buffer, buffer.length);
	}

	protected async handleHydrate(): Promise<Buffer | undefined> {
		const blockBlobClient = await this.getBlockBlobClient();
		if (await blockBlobClient.exists()) {
			return blockBlobClient.downloadToBuffer();
		}
		return undefined;
	}

	protected async handleClear(): Promise<void> {
		const blockBlobClient = await this.getBlockBlobClient();
		await blockBlobClient.deleteIfExists();
	}

	private async getContainerClient(): Promise<ContainerClient> {
		if (!this.containerClient) {
			const containerName = typeof this.containerName === 'string' ? this.containerName : await this.containerName();
			this.containerClient = (await this.getBlobServiceClient()).getContainerClient(containerName);
		}
		return this.containerClient;
	}

	private async getBlockBlobClient(): Promise<BlockBlobClient> {
		if (!this.blockBlobClient) {
			const containerClient = await this.getContainerClient();
			await containerClient.createIfNotExists();
			const fileName = typeof this.fileName === 'string' ? this.fileName : await this.fileName();
			this.blockBlobClient = containerClient.getBlockBlobClient(fileName);
		}
		return this.blockBlobClient;
	}

	private async getBlobServiceClient(): Promise<BlobServiceClient> {
		if (!this.blobServiceClient) {
			const connectionString = typeof this.connectionString === 'string' ? this.connectionString : await this.connectionString();
			this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
		}
		return this.blobServiceClient;
	}
}
