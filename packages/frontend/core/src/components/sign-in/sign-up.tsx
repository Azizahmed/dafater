import { notify } from '@affine/component';
import {
  AuthContainer,
  AuthContent,
  AuthFooter,
  AuthHeader,
  AuthInput,
} from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  AuthService,
  CaptchaService,
  getSelfHostedServerName,
  ServerService,
} from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { Unreachable } from '@affine/env/constant';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { SignInState } from '.';
import { Back } from './back';
import { Captcha } from './captcha';
import { FirstUserNote, useIsFirstUserOnServer } from './first-user-note';
import * as styles from './style.css';

const DEFAULT_PASSWORD_LIMITS = { minLength: 8, maxLength: 32 };

/**
 * Dafater account creation: shown when the entered email has no account yet
 * on a Dafater (self-hosted) server. The first account on a server becomes
 * its administrator.
 */
export const SignUpStep = ({
  state,
  changeState,
  onAuthenticated,
}: {
  state: SignInState;
  changeState: Dispatch<SetStateAction<SignInState>>;
  onAuthenticated?: (status: AuthSessionStatus) => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const captchaService = useService(CaptchaService);
  const serverService = useService(ServerService);

  const email = state.email;
  if (!email) {
    throw new Unreachable();
  }

  const serverName = useLiveData(
    serverService.server.config$.selector(c => c.serverName)
  );
  const passwordLimits =
    useLiveData(serverService.server.credentialsRequirement$)?.password ??
    DEFAULT_PASSWORD_LIMITS;
  const { minLength, maxLength } = passwordLimits;
  const isFirstUser = useIsFirstUserOnServer();

  const verifyToken = useLiveData(captchaService.verifyToken$);
  const needCaptcha = useLiveData(captchaService.needCaptcha$);
  const challenge = useLiveData(captchaService.challenge$);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // set right before signing up, so the success toast can greet the admin
  const signedUpAsAdmin = useRef<boolean | null>(null);

  const loginStatus = useLiveData(authService.session.status$);

  useEffect(() => {
    if (loginStatus === 'authenticated' && signedUpAsAdmin.current !== null) {
      notify.success({
        title: t['com.affine.auth.sign-up.success.title'](),
        message: signedUpAsAdmin.current
          ? t['com.affine.auth.sign-up.success.admin-message']()
          : t['com.affine.auth.sign-up.success.message'](),
      });
    }
    onAuthenticated?.(loginStatus);
  }, [loginStatus, onAuthenticated, t]);

  const passwordLengthValid =
    password.length >= minLength && password.length <= maxLength;

  const onSignUp = useAsyncCallback(async () => {
    if (isLoading || (!verifyToken && needCaptcha)) return;

    if (!passwordLengthValid) {
      setPasswordError(true);
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError(true);
      return;
    }

    setIsLoading(true);
    try {
      const { isAdmin } = await authService.signUp({
        email,
        password,
        name: name.trim() || undefined,
        verifyToken,
        challenge,
      });
      signedUpAsAdmin.current = isAdmin;
      // the session may already be authenticated by the time we get here
      if (authService.session.status$.value === 'authenticated') {
        notify.success({
          title: t['com.affine.auth.sign-up.success.title'](),
          message: isAdmin
            ? t['com.affine.auth.sign-up.success.admin-message']()
            : t['com.affine.auth.sign-up.success.message'](),
        });
        signedUpAsAdmin.current = null;
      }
    } catch (err) {
      console.error(err);
      const error = UserFriendlyError.fromAny(err);
      if (error.is('INVALID_PASSWORD_LENGTH')) {
        setPasswordError(true);
      } else {
        notify.error({
          title: t['com.affine.auth.sign-up.failed'](),
          message: error.is('REQUEST_ABORTED')
            ? t['error.NETWORK_ERROR']()
            : t[`error.${error.name}`](error.data),
        });
      }
      captchaService.revalidate();
    } finally {
      setIsLoading(false);
    }
  }, [
    isLoading,
    verifyToken,
    needCaptcha,
    passwordLengthValid,
    password,
    confirmPassword,
    authService,
    email,
    name,
    challenge,
    captchaService,
    t,
  ]);

  return (
    <AuthContainer>
      <AuthHeader
        title={
          isFirstUser
            ? t['com.affine.auth.sign-up.admin.title']()
            : t['com.affine.auth.sign-up.title']()
        }
        subTitle={getSelfHostedServerName(serverName)}
      />

      <AuthContent>
        {isFirstUser ? (
          <FirstUserNote />
        ) : (
          <div className={styles.signUpHint}>
            {t['com.affine.auth.sign-up.no-account-hint']()}
          </div>
        )}
        <form
          data-testid="sign-up-form"
          onSubmit={event => {
            event.preventDefault();
            onSignUp();
          }}
        >
          <AuthInput
            label={t['com.affine.settings.email']()}
            readOnly={true}
            value={email}
            type="email"
            name="username"
            autoComplete="username"
          />
          <AuthInput
            autoFocus
            data-testid="sign-up-name-input"
            label={t['com.affine.auth.sign-up.name']()}
            placeholder={t['com.affine.auth.sign-up.name.placeholder']()}
            value={name}
            maxLength={64}
            name="name"
            autoComplete="name"
            onChange={setName}
          />
          <AuthInput
            data-testid="sign-up-password-input"
            label={t['com.affine.auth.password']()}
            placeholder={t['com.affine.auth.sign-up.password.placeholder']({
              min: String(minLength),
              max: String(maxLength),
            })}
            value={password}
            type="password"
            name="new-password"
            autoComplete="new-password"
            onChange={(value: string) => {
              setPassword(value);
              setPasswordError(false);
            }}
            error={passwordError}
            errorHint={t['com.affine.auth.sign-up.password.length-error']({
              min: String(minLength),
              max: String(maxLength),
            })}
          />
          <AuthInput
            data-testid="sign-up-confirm-password-input"
            label={t['com.affine.auth.sign-up.confirm-password']()}
            value={confirmPassword}
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            onChange={(value: string) => {
              setConfirmPassword(value);
              setConfirmError(false);
            }}
            error={confirmError}
            errorHint={t['com.affine.auth.sign-up.confirm-password.error']()}
            onEnter={onSignUp}
          />
          {!verifyToken && needCaptcha && <Captcha />}
          <Button
            data-testid="sign-up-button"
            variant="primary"
            size="extraLarge"
            style={{ width: '100%' }}
            loading={isLoading}
            disabled={
              isLoading ||
              !password ||
              !confirmPassword ||
              (!verifyToken && needCaptcha)
            }
          >
            {t['com.affine.auth.sign-up.submit']()}
          </Button>
        </form>
      </AuthContent>
      <AuthFooter>
        <Back changeState={changeState} />
      </AuthFooter>
    </AuthContainer>
  );
};
