import {EventEmitter} from 'events';
import {type ExternalNotifyEventsMap, type IExternalNotify, type IPersistSerializer, type IStorageDriver} from 'tachyon-drive';
import {CryptoBufferProcessor} from 'tachyon-drive-node-fs';
import {beforeAll, describe, expect, it} from 'vitest';
import {z} from 'zod';
import {AzureBlobStorageDriver} from '../src/index.js';

const dataSchema = z.object({
	test: z.string(),
});

type Data = z.infer<typeof dataSchema>;

const bufferSerializer: IPersistSerializer<Data, Buffer> = {
	name: 'BufferSerializer',
	serialize: (data: Data) => Buffer.from(JSON.stringify(data)),
	deserialize: (buffer: Buffer) => JSON.parse(buffer.toString()) as Data,
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

class SimpleNotify extends EventEmitter<ExternalNotifyEventsMap> implements IExternalNotify {
	private callback = new Set<(timeStamp: Date) => Promise<void>>();

	public init(): Promise<void> {
		return Promise.resolve();
	}

	public unload(): Promise<void> {
		return Promise.resolve();
	}

	public onUpdate(callback: (timeStamp: Date) => Promise<void>): void {
		this.callback.add(callback);
	}

	public async notifyUpdate(timeStamp: Date): Promise<void> {
		await Promise.all([...this.callback].map((callback) => callback(timeStamp)));
	}
}

const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));

const emulatorStorageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? 'UseDevelopmentStorage=true';

const driverSet = new Set<IStorageDriver<Data>>([
	new AzureBlobStorageDriver(
		'AzureBlobStorageDriver',
		{
			connectionString: () => Promise.resolve(emulatorStorageConnectionString),
			containerName: () => Promise.resolve('test'),
			fileName: () => Promise.resolve('test.json'),
		},
		bufferSerializer,
	),
	new AzureBlobStorageDriver(
		'CryptAzureBlobStorageDriver',
		{
			connectionString: emulatorStorageConnectionString,
			containerName: 'test',
			fileName: 'test.aes',
		},
		bufferSerializer,
		new SimpleNotify(),
		() => processor,
	),
]);

const data = dataSchema.parse({test: 'demo'});

describe('StorageDriver', () => {
	driverSet.forEach((currentDriver) => {
		describe(currentDriver.name, () => {
			beforeAll(async function () {
				await currentDriver.init();
				await currentDriver.clear();
				expect(currentDriver.isInitialized).to.be.eq(false);
			});
			it('should be empty store', async () => {
				expect(await currentDriver.hydrate()).to.eq(undefined);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should store to storage driver', async () => {
				await currentDriver.store(data);
				expect(await currentDriver.hydrate()).to.eql(data);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should restore data from storage driver', async () => {
				expect(await currentDriver.hydrate()).to.eql(data);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should clear to storage driver', async () => {
				await currentDriver.clear();
				expect(currentDriver.isInitialized).to.be.eq(false);
				expect(await currentDriver.hydrate()).to.eq(undefined);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should unload to storage driver', async () => {
				expect(currentDriver.isInitialized).to.be.eq(true);
				expect(await currentDriver.unload()).to.eq(true);
				expect(currentDriver.isInitialized).to.be.eq(false);
			});
		});
	});
});
