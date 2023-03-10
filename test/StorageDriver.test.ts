import * as zod from 'zod';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import 'mocha';
import {IPersistSerializer, IStorageDriver} from 'tachyon-drive';
import {CryptoBufferProcessor} from 'tachyon-drive-node-fs';
import {AzureBlobStorageDriver} from '../src/';

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

const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));

const emulatorStorageConnectionString = 'UseDevelopmentStorage=true';

const driverSet = new Set<IStorageDriver<Data>>([
	new AzureBlobStorageDriver(
		'AzureBlobStorageDriver',
		async () => emulatorStorageConnectionString,
		async () => 'test',
		async () => 'test.json',
		bufferSerializer,
	),
	new AzureBlobStorageDriver('CryptAzureBlobStorageDriver', emulatorStorageConnectionString, 'test', 'test.aes', bufferSerializer, processor),
]);

const data = dataSchema.parse({test: 'demo'});

describe('StorageDriver', () => {
	driverSet.forEach((currentDriver) => {
		describe(currentDriver.name, () => {
			before(async () => {
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
		});
	});
});
