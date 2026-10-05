/**
 * Dafater accounts: email + password sign-up on the Dafater server itself
 * (`POST /api/auth/sign-up`, no email verification). The first account on a
 * server becomes its administrator.
 *
 * The suite runs in English (the test kit pins `arabase:locale` to `en`).
 * All accounts use `@dafater.test` emails and are removed afterwards.
 */
import { test } from '@affine-test/kit/playwright';
import { createRandomUser, runPrisma } from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

const PASSWORD = '12345678';

function randomEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@dafater.test`;
}

async function openSignIn(page: Page) {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await page.getByTestId('sidebar-user-avatar').click({ delay: 200 });
  await expect(page.getByTestId('auth-modal')).toBeVisible();
}

async function continueWithEmail(page: Page, email: string) {
  await page.getByPlaceholder('Enter your email address').fill(email);
  await page.getByTestId('continue-login-button').click({ delay: 200 });
}

async function isAdministrator(email: string) {
  return runPrisma(async client => {
    const user = await client.user.findFirst({
      where: { email },
      include: {
        features: { where: { name: 'administrator', activated: true } },
      },
    });
    return !!user && user.features.length > 0;
  });
}

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await runPrisma(client =>
    client.user.deleteMany({ where: { email: { endsWith: '@dafater.test' } } })
  );
});

test('the first account on an empty server becomes the administrator', async ({
  page,
}) => {
  const userCount = await runPrisma(client => client.user.count());
  test.skip(userCount > 0, 'the server already has users');

  await openSignIn(page);
  // first screen: administrator title + note
  await expect(page.getByTestId('sign-up-first-user-note')).toBeVisible();
  await expect(
    page.getByText('Create the administrator account').first()
  ).toBeVisible();

  const email = randomEmail('owner');
  await continueWithEmail(page, email);

  await expect(page.getByTestId('sign-up-form')).toBeVisible();
  await expect(page.getByTestId('sign-up-first-user-note')).toBeVisible();

  await page.getByTestId('sign-up-name-input').fill('Owner');
  await page.getByTestId('sign-up-password-input').fill(PASSWORD);
  await page.getByTestId('sign-up-confirm-password-input').fill(PASSWORD);
  await page.getByTestId('sign-up-button').click();

  await expect(page.getByTestId('auth-modal')).toBeHidden({ timeout: 15000 });
  expect(await isAdministrator(email)).toBe(true);
});

test('a new email gets the sign-up form and a regular account', async ({
  page,
}) => {
  // make sure the server is initialized, so this is not the first account
  await createRandomUser();

  await openSignIn(page);
  await expect(page.getByTestId('sign-up-first-user-note')).toBeHidden();

  const email = randomEmail('member');
  await continueWithEmail(page, email);

  const form = page.getByTestId('sign-up-form');
  await expect(form).toBeVisible();
  await expect(page.getByTestId('sign-up-first-user-note')).toBeHidden();
  // the magic link step is never shown on a Dafater server
  await expect(page.getByTestId('send-magic-link-button')).toHaveCount(0);

  // too short
  await page.getByTestId('sign-up-password-input').fill('123');
  await page.getByTestId('sign-up-confirm-password-input').fill('123');
  await page.getByTestId('sign-up-button').click();
  await expect(
    page.getByText('Password must be between 8 and 32 characters.')
  ).toBeVisible();

  // mismatch
  await page.getByTestId('sign-up-password-input').fill(PASSWORD);
  await page.getByTestId('sign-up-confirm-password-input').fill('87654321');
  await page.getByTestId('sign-up-button').click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();

  await page.getByTestId('sign-up-confirm-password-input').fill(PASSWORD);
  await page.getByTestId('sign-up-button').click();

  await expect(page.getByTestId('auth-modal')).toBeHidden({ timeout: 15000 });

  const user = await runPrisma(client =>
    client.user.findFirst({ where: { email } })
  );
  expect(user?.registered).toBe(true);
  expect(user?.emailVerifiedAt).toBeTruthy();
  expect(await isAdministrator(email)).toBe(false);
});

test('registered users keep the password step', async ({ page }) => {
  const email = randomEmail('existing');
  const res = await page.request.post('/api/auth/sign-up', {
    data: { email, password: PASSWORD },
  });
  expect(res.ok()).toBe(true);
  await page.context().clearCookies();

  await openSignIn(page);
  await continueWithEmail(page, email);

  await expect(page.getByTestId('password-input')).toBeVisible();
  await expect(page.getByTestId('sign-up-form')).toHaveCount(0);
  await page.getByTestId('password-input').fill(PASSWORD);
  await page.getByTestId('sign-in-button').click();
  await expect(page.getByTestId('auth-modal')).toBeHidden({ timeout: 15000 });
});

test('signing up with an existing email is rejected', async ({ page }) => {
  const email = randomEmail('dup');
  const first = await page.request.post('/api/auth/sign-up', {
    data: { email, password: PASSWORD },
  });
  expect(first.ok()).toBe(true);

  const second = await page.request.post('/api/auth/sign-up', {
    data: { email: email.toUpperCase(), password: PASSWORD },
  });
  expect(second.ok()).toBe(false);
  expect((await second.json()).name).toBe('EMAIL_ALREADY_USED');
});
