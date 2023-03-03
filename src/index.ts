import {ILoggerLike, IPersistSerializer, IStoreProcessor, StorageDriver} from 'tachyon-drive';
import {BlobServiceClient, BlockBlobClient, ContainerClient} from '@azure/storage-blob';

export class AzureBlobStorageDriver<Input> extends StorageDriver<Input, Buffer> {
	private blobServiceClient: BlobServiceClient;
	private containerClient: ContainerClient | undefined;
	private blockBlobClient: BlockBlobClient | undefined;
	private readonly containerName: string;
	private readonly fileName: string;

	constructor(
		name: string,
		connectionString: string,
		containerName: string,
		fileName: string,
		serializer: IPersistSerializer<Input, Buffer>,
		processor?: IStoreProcessor<Buffer>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, processor, logger);
		this.containerName = containerName;
		this.fileName = fileName;
		this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
	}

	protected async handleInit(): Promise<boolean> {
		const containerClient = this.getContainerClient();
		await containerClient.createIfNotExists();
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

	private getContainerClient(): ContainerClient {
		if (!this.containerClient) {
			this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
		}
		return this.containerClient;
	}

	private async getBlockBlobClient(): Promise<BlockBlobClient> {
		if (!this.blockBlobClient) {
			const containerClient = this.getContainerClient();
			await containerClient.createIfNotExists();
			this.blockBlobClient = containerClient.getBlockBlobClient(this.fileName);
		}
		return this.blockBlobClient;
	}
}
