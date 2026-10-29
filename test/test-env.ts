export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://raul:1234@localhost:5432/tickr_test?schema=public';
