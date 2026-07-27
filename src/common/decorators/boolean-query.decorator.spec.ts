import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { BooleanQuery } from './boolean-query.decorator';

class ProbeQuery {
  @BooleanQuery('Read state')
  read?: boolean;
}

/** The same pipe configuration `app.setup.ts` installs globally. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const metadata: ArgumentMetadata = {
  type: 'query',
  metatype: ProbeQuery,
};

const parse = (query: Record<string, string>): Promise<ProbeQuery> =>
  pipe.transform(query, metadata) as Promise<ProbeQuery>;

describe('BooleanQuery', () => {
  it('reads "true" as true', async () => {
    await expect(parse({ read: 'true' })).resolves.toEqual({ read: true });
  });

  // The reason this decorator exists: `enableImplicitConversion` would coerce
  // the string 'false' with `Boolean('false')`, which is `true`.
  it('reads "false" as false, not as a truthy string', async () => {
    await expect(parse({ read: 'false' })).resolves.toEqual({ read: false });
  });

  it('leaves the property undefined when omitted, so "no filter" survives', async () => {
    await expect(parse({})).resolves.toEqual({});
  });
});
