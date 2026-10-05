/**
 * Dafater AI: the server administrator (the first account) connects an
 * OpenAI-compatible provider from Settings → Server → AI, and the chat then
 * answers through that provider. The provider is the local mock in
 * `tools/dafater/mock-openai.mjs`, so no API key is needed.
 *
 * Needs an empty server (no users); skipped otherwise. Everything it creates
 * (the admin account, the AI settings) is removed afterwards.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { test } from '@affine-test/kit/playwright';
import { runPrisma } from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarSettingButton } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

const MOCK_PORT = 18181;
const MOCK_REPLY = 'مرحبًا من الخادم التجريبي لدفاتر';
const ADMIN = {
  email: `ai-admin-${Date.now()}@dafater.test`,
  password: '12345678',
  name: 'AI Admin',
};

let mock: ChildProcess | undefined;
// only clean up what this suite created: never touch a real server's settings
let createdAdmin = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const script = fileURLToPath(
    new URL('../../../tools/dafater/mock-openai.mjs', import.meta.url)
  );
  mock = spawn(process.execPath, [script], {
    env: { ...process.env, PORT: String(MOCK_PORT) },
    stdio: 'ignore',
  });
  await expect
    .poll(
      async () =>
        fetch(`http://localhost:${MOCK_PORT}/v1/models`)
          .then(res => res.ok)
          .catch(() => false),
      { timeout: 10_000 }
    )
    .toBe(true);
});

test.afterAll(async () => {
  mock?.kill();
  if (!createdAdmin) return;
  await runPrisma(async client => {
    await client.appConfig.deleteMany({
      where: { id: { startsWith: 'copilot.' } },
    });
    await client.user.deleteMany({ where: { email: ADMIN.email } });
  });
});

test('the administrator connects an OpenAI-compatible provider and chats', async ({
  page,
}) => {
  const userCount = await runPrisma(client => client.user.count());
  test.skip(userCount > 0, 'the server already has users');

  await openHomePage(page);
  await waitForEditorLoad(page);

  // the first account becomes the administrator
  const signUp = await page.request.post('/api/auth/sign-up', {
    data: ADMIN,
  });
  expect(signUp.ok()).toBe(true);
  createdAdmin = true;
  expect((await signUp.json()).isAdmin).toBe(true);
  await page.reload();
  await waitForEditorLoad(page);

  // Settings → Server → AI (only listed for the administrator)
  await clickSideBarSettingButton(page);
  await page.getByTestId('server-ai-panel-trigger').click();
  await page
    .getByTestId('server-ai-base-url')
    .fill(`http://localhost:${MOCK_PORT}/v1`);
  await page.getByTestId('server-ai-api-key').fill('test');
  await page.getByTestId('server-ai-model').fill('mock-model');
  await page.getByTestId('server-ai-enabled').click();
  await page.getByTestId('server-ai-advanced').click();
  await page.getByTestId('server-ai-private-network').click();

  await page.getByTestId('server-ai-test').click();
  await expect(page.getByText(MOCK_REPLY).first()).toBeVisible();

  await page.getByTestId('server-ai-save').click();
  await expect(page.getByText('AI settings saved')).toBeVisible();
  await page.keyboard.press('Escape');

  // the chat answers through the configured provider
  const chatUrl = new URL(page.url());
  chatUrl.pathname = chatUrl.pathname.replace(/\/[^/]+$/, '/chat');
  await page.goto(chatUrl.toString());
  await page.getByTestId('chat-panel-input').focus();
  await page.keyboard.type('hello');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('chat-message-assistant').last()).toContainText(
    MOCK_REPLY,
    { timeout: 30_000 }
  );
});
