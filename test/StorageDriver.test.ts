import 'mocha';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as zod from 'zod';
import {IExternalNotify, IPersistSerializer, IStorageDriver} from 'tachyon-drive';
import {AzureBlobStorageDriver} from '../src/';
import {CryptoBufferProcessor} from 'tachyon-drive-node-fs';

chai.use(chaiAsPromised);

const expect = chai.expect;

const dataSchema = zod.object({
	test: zod.string(),
});

type Data = zod.infer<typeof dataSchema>;

const bufferSerializer: IPersistSerializer<Data, Buffer> = {
	serialize: (data: Data) => Buffer.from(JSON.stringify(data)),
	deserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

class SimpleNotify implements IExternalNotify {
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

const emulatorStorageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';

const driverSet = new Set<IStorageDriver<Data>>([
	new AzureBlobStorageDriver(
		'AzureBlobStorageDriver',
		async () => emulatorStorageConnectionString,
		async () => 'test',
		async () => 'test.json',
		bufferSerializer,
	),
	new AzureBlobStorageDriver(
		'CryptAzureBlobStorageDriver',
		emulatorStorageConnectionString,
		'test',
		'test.aes',
		bufferSerializer,
		new SimpleNotify(),
		processor,
	),
]);

const data = dataSchema.parse({test: 'demo'});

describe('StorageDriver', () => {
	driverSet.forEach((currentDriver) => {
		describe(currentDriver.name, () => {
			before(async function () {
				this.timeout(10000);
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
