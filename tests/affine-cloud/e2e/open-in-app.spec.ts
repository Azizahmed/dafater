import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

let user: {
  id: string;
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async ({ page }) => {
  user = await createRandomUser();
  await loginUser(page, user);
  await enableCloudWorkspace(page);
  await waitForEditorLoad(page);
  await page.reload();
  await waitForEditorLoad(page);
});

test.afterEach(async () => {
  // if you want to keep the user in the database for debugging,
  // comment this line
  await deleteUser(user.email);
});

test('no open-in-app card for cloud workspace', async ({ page }) => {
  // Dafater has no AFFiNE desktop-app upsell: the card must never appear.
  await expect(page.getByTestId('open-in-app-card')).toHaveCount(0);
  await page.reload();
  await waitForEditorLoad(page);
  await expect(page.getByTestId('open-in-app-card')).toHaveCount(0);
});
