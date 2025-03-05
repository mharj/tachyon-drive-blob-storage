import type {ILoggerLike} from '@avanio/logger-like';
import {BlobServiceClient, type BlockBlobClient, type ContainerClient} from '@azure/storage-blob';
import {type Loadable, resolveLoadable} from '@luolapeikko/ts-common';
import {type IExternalNotify, type IPersistSerializer, type IStoreProcessor, StorageDriver, TachyonBandwidth} from 'tachyon-drive';

export type AzureBlobStorageDriverOptions = {
	connectionString: Loadable<string>;
	containerName: Loadable<string>;
	fileName: Loadable<string>;
	/** Optional bandwidth settings, defaults to "TachyonBandwidth.VerySmall" because of operation cost */
	bandwidth?: TachyonBandwidth;
};

export class AzureBlobStorageDriver<Input> extends StorageDriver<Input, Buffer> {
	public readonly bandwidth: TachyonBandwidth;
	private containerName: Loadable<string>;
	private fileName: Loadable<string>;
	private connectionString: Loadable<string>;
	private blobServiceClient: BlobServiceClient | undefined;
	private containerClient: ContainerClient | undefined;
	private blockBlobClient: BlockBlobClient | undefined;

	/**
	 * AzureBlobStorageDriver
	 * @param name - name of the driver
	 * @param blobOptions - options for the Azure Blob Storage (connectionString, containerName, fileName)
	 * @param serializer - serializer to serialize and deserialize data (to and from Buffer)
	 * @param extNotify - optional external notify service to notify store update events
	 * @param processor - optional processor to process data (encrypt, decrypt, compress, decompress, etc.)
	 * @param logger - optional logger
	 */
	constructor(
		name: string,
		blobOptions: AzureBlobStorageDriverOptions,
		serializer: IPersistSerializer<Input, Buffer>,
		extNotify?: IExternalNotify,
		processor?: Loadable<IStoreProcessor<Buffer>>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, extNotify ?? null, processor, logger);
		this.bandwidth = blobOptions.bandwidth ?? TachyonBandwidth.VerySmall;
		this.containerName = blobOptions.containerName;
		this.fileName = blobOptions.fileName;
		this.connectionString = blobOptions.connectionString;
	}

	protected async handleInit(): Promise<boolean> {
		const containerClient = await this.getContainerClient();
		await containerClient.createIfNotExists();
		return true;
	}

	protected handleUnload(): boolean {
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
			this.containerClient = (await this.getBlobServiceClient()).getContainerClient(await resolveLoadable(this.containerName));
		}
		return this.containerClient;
	}

	private async getBlockBlobClient(): Promise<BlockBlobClient> {
		if (!this.blockBlobClient) {
			const containerClient = await this.getContainerClient();
			await containerClient.createIfNotExists();
			this.blockBlobClient = containerClient.getBlockBlobClient(await resolveLoadable(this.fileName));
		}
		return this.blockBlobClient;
	}

	private async getBlobServiceClient(): Promise<BlobServiceClient> {
		if (!this.blobServiceClient) {
			this.blobServiceClient = BlobServiceClient.fromConnectionString(await resolveLoadable(this.connectionString));
		}
		return this.blobServiceClient;
	}
}
