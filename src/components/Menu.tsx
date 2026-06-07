import { useState } from 'react';
import { Platform, View, Text, ScrollView } from 'react-native';
import { ScreenContainer } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { SecurityNavigationProp } from '../types/navigation';
import { ConfirmationPrompt } from './ConfirmationPrompt';
import { useToast } from './ToastContext';
import { getUserFacingErrorMessage } from '../services/userFacingErrors';
import { LinkPasswordModal } from './menu/LinkPasswordModal';
import { MenuItem } from './menu/MenuItem';
import { getMenuStyles } from './menu/menuStyles';
import { authCopy } from '../features/auth/domain/authCopy';
import { useAppUpdate } from '../features/updates/state/UpdateContext';
import { ReleaseNotificationSettingsCard } from '../features/userSettings/components/ReleaseNotificationSettingsCard';

export default function Menu() {
  const { signOut } = useAuth();
  const { showToast } = useToast();
  const appUpdate = useAppUpdate();
  const navigation = useNavigation<SecurityNavigationProp>();
  const [deletePromptVisible, setDeletePromptVisible] = useState(false);
  const [linkGooglePromptVisible, setLinkGooglePromptVisible] = useState(false);
  const [linkPasswordPromptVisible, setLinkPasswordPromptVisible] = useState(false);
  const [unlinkGooglePromptVisible, setUnlinkGooglePromptVisible] = useState(false);
  const [unlinkPasswordPromptVisible, setUnlinkPasswordPromptVisible] = useState(false);
  const [passwordLinkEmail, setPasswordLinkEmail] = useState('');
  const [passwordLinkPassword, setPasswordLinkPassword] = useState('');
  const [passwordLinkConfirm, setPasswordLinkConfirm] = useState('');

  const styles = getMenuStyles();

  const { linkGoogle, linkPassword, unlinkProvider, user } = useAuth();
  const providers = user?.providerData || [];
  const canUseGoogleAuth = Platform.OS === 'android';
  const hasPasswordProvider = !!providers.some(p => p.providerId === 'password');
  const hasGoogleProvider = !!providers.some(p => p.providerId === 'google.com');
  const canUnlinkGoogle = canUseGoogleAuth && hasGoogleProvider && providers.length > 1;
  const canLinkGoogle = canUseGoogleAuth && !hasGoogleProvider && providers.length > 0;
  const canUnlinkPassword = hasPasswordProvider && providers.length > 1;
  const canLinkPassword = !hasPasswordProvider && providers.length > 0;
  const updateDescription = appUpdate.status === 'available' && appUpdate.latestRelease
    ? `Version ${appUpdate.latestRelease.version} available${appUpdate.skippedReleaseTag === appUpdate.latestRelease.tagName ? ' (skipped on startup)' : ''}`
    : appUpdate.isConfigured
      ? `Current version ${appUpdate.currentVersion}`
      : 'Update source not configured';
  const signInMenuItems: Array<{
    icon: string;
    label: string;
    onPress: () => void;
    danger?: boolean;
  }> = [];

  if (canLinkPassword) {
    signInMenuItems.push({
      icon: 'link',
      label: 'Link Password Sign-In',
      onPress: () => setLinkPasswordPromptVisible(true),
    });
  }

  if (canLinkGoogle) {
    signInMenuItems.push({
      icon: 'link',
      label: 'Link Google Sign-In',
      onPress: () => setLinkGooglePromptVisible(true),
    });
  }

  if (canUnlinkGoogle) {
    signInMenuItems.push({
      icon: 'link-off',
      label: 'Unlink Google Account',
      onPress: () => setUnlinkGooglePromptVisible(true),
      danger: true,
    });
  }

  if (canUnlinkPassword) {
    signInMenuItems.push({
      icon: 'link-off',
      label: 'Unlink Password Sign-In',
      onPress: () => setUnlinkPasswordPromptVisible(true),
      danger: true,
    });
  }

  const handleSecurityAction = (actionType: 'email' | 'password' | 'delete') => {
    navigation.navigate('Security', { actionType });
  };

  const handleDeleteAccount = () => setDeletePromptVisible(true);
  const handleDeleteUser = () => {
    setDeletePromptVisible(false);
    handleSecurityAction('delete');
  };

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={{ marginTop: styles.section.marginTop + 10 }}>
          <View style={styles.menuCard}>
            <MenuItem
              icon="system-update-alt"
              label="App Updates"
              subtitle={updateDescription}
              onPress={() => {
                void appUpdate.checkForUpdates({
                  showModalOnUpdate: true,
                  showModalWhenCurrent: true,
                });
              }}
              loading={appUpdate.isChecking}
              disabled={!appUpdate.isConfigured}
              showDivider={false}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.menuCard}>
            <ReleaseNotificationSettingsCard />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.menuCard}>
            <MenuItem
              icon="logout"
              label="Sign Out"
              onPress={signOut}
              showDivider={hasPasswordProvider}
            />
            {hasPasswordProvider && (
              <>
                <MenuItem
                  icon="email"
                  label="Change Email"
                  onPress={() =>
                    !hasGoogleProvider ?
                      handleSecurityAction('email') :
                      showToast(
                        authCopy.security.googleLinkedEmailAndroid,
                        'error'
                      )
                  }
                  showDivider={true}
                />
                <MenuItem
                  icon="lock"
                  label="Change Password"
                  onPress={() => handleSecurityAction('password')}
                  showDivider={false}
                />
              </>
            )}
          </View>
        </View>

        {signInMenuItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.menuCard}>
              {signInMenuItems.map((item, index) => (
                <MenuItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  onPress={item.onPress}
                  danger={item.danger}
                  showDivider={index < signInMenuItems.length - 1}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={[styles.menuCard, styles.menuCardDanger]}>
            <MenuItem
              icon="delete"
              label="Delete Account"
              onPress={handleDeleteAccount}
              danger
              showDivider={false}
            />
          </View>
        </View>
      </ScrollView>
      <ConfirmationPrompt
        visible={deletePromptVisible}
        message="Are you sure you want to delete your account? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
        onConfirm={handleDeleteUser}
        onCancel={() => setDeletePromptVisible(false)}
      />
      <ConfirmationPrompt
        visible={linkGooglePromptVisible}
        message={authCopy.menu.linkGooglePrompt}
        confirmText="Link"
        cancelText="Cancel"
        danger={false}
        onConfirm={async () => {
          setLinkGooglePromptVisible(false);
          try {
            await linkGoogle();
            showToast(authCopy.menu.linkGoogleSuccess, 'success');
          } catch (e) {
            console.warn('menu: link Google account failed', e);
            showToast(getUserFacingErrorMessage(e, authCopy.menu.linkGoogleFailed), 'error');
          }
        }}
        onCancel={() => setLinkGooglePromptVisible(false)}
      />
      {
        linkPasswordPromptVisible && (
          <LinkPasswordModal
            visible={linkPasswordPromptVisible}
            email={passwordLinkEmail}
            password={passwordLinkPassword}
            confirmPassword={passwordLinkConfirm}
            onEmailChange={setPasswordLinkEmail}
            onPasswordChange={setPasswordLinkPassword}
            onConfirmPasswordChange={setPasswordLinkConfirm}
            onConfirm={async () => {
              try {
                if (passwordLinkPassword !== passwordLinkConfirm) {
                  showToast(authCopy.resetPassword.passwordMismatch, 'error');
                  return;
                }
                if (passwordLinkPassword.length < 6) {
                  showToast(authCopy.resetPassword.passwordTooShort, 'error');
                  return;
                }
                if (!/^\S+@\S+\.\S+$/.test(passwordLinkEmail)) {
                  showToast(authCopy.security.validation.invalidEmail, 'error');
                  return;
                }

                await linkPassword(passwordLinkEmail, passwordLinkPassword);
                setLinkPasswordPromptVisible(false);
                setPasswordLinkEmail('');
                setPasswordLinkPassword('');
                setPasswordLinkConfirm('');
                showToast(authCopy.menu.linkPasswordSuccess, 'success');
              } catch (error) {
                showToast(getUserFacingErrorMessage(error, authCopy.menu.linkPasswordFailed), 'error');
              }
            }}
            onCancel={() => {
              setLinkPasswordPromptVisible(false);
              setPasswordLinkEmail('');
              setPasswordLinkPassword('');
              setPasswordLinkConfirm('');
            }}
          />
        )
      }
      <ConfirmationPrompt
        visible={unlinkGooglePromptVisible}
        message={canUnlinkGoogle ? authCopy.menu.unlinkGooglePrompt : authCopy.menu.unlinkOnlyProvider}
        confirmText="Unlink"
        cancelText="Cancel"
        danger={true}
        onConfirm={async () => {
          setUnlinkGooglePromptVisible(false);
          try {
            if (!canUnlinkGoogle) throw new Error('Cannot unlink the only provider');
            await unlinkProvider('google.com');
            showToast(authCopy.menu.unlinkGoogleSuccess, 'success');
          } catch (e) {
            console.warn('menu: unlink Google account failed', e);
            showToast(getUserFacingErrorMessage(e, authCopy.menu.unlinkGoogleFailed), 'error');
          }
        }}
        onCancel={() => setUnlinkGooglePromptVisible(false)}
      />
      <ConfirmationPrompt
        visible={unlinkPasswordPromptVisible}
        message={canUnlinkPassword ? authCopy.menu.unlinkPasswordPrompt : authCopy.menu.unlinkOnlyProvider}
        confirmText="Unlink"
        cancelText="Cancel"
        danger={true}
        onConfirm={async () => {
          setUnlinkPasswordPromptVisible(false);
          try {
            if (!canUnlinkPassword) throw new Error('Cannot unlink the only provider');
            await unlinkProvider('password');
            showToast(authCopy.menu.unlinkPasswordSuccess, 'success');
          } catch (e) {
            console.warn('menu: unlink password provider failed', e);
            showToast(getUserFacingErrorMessage(e, authCopy.menu.unlinkPasswordFailed), 'error');
          }
        }}
        onCancel={() => setUnlinkPasswordPromptVisible(false)}
      />
    </ScreenContainer >
  );
}
