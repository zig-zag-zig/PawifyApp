import { useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { SecurityNavigationProp } from '../../types/navigation';
import { useToast } from '../../contexts/ToastContext';
import { getUserFacingErrorMessage } from '../../services/userFacingErrors';
import { authCopy } from '../auth/domain/authCopy';

export function useAccountSecurityController() {
  const { signOut, linkGoogle, linkPassword, unlinkProvider, user } = useAuth();
  const { showToast } = useToast();
  const navigation = useNavigation<SecurityNavigationProp>();

  const [deletePromptVisible, setDeletePromptVisible] = useState(false);
  const [linkGooglePromptVisible, setLinkGooglePromptVisible] = useState(false);
  const [linkPasswordPromptVisible, setLinkPasswordPromptVisible] = useState(false);
  const [unlinkGooglePromptVisible, setUnlinkGooglePromptVisible] = useState(false);
  const [unlinkPasswordPromptVisible, setUnlinkPasswordPromptVisible] = useState(false);
  const [passwordLinkEmail, setPasswordLinkEmail] = useState('');
  const [passwordLinkPassword, setPasswordLinkPassword] = useState('');
  const [passwordLinkConfirm, setPasswordLinkConfirm] = useState('');

  const providers = user?.providerData || [];
  const canUseGoogleAuth = Platform.OS === 'android';
  const hasPasswordProvider = !!providers.some(p => p.providerId === 'password');
  const hasGoogleProvider = !!providers.some(p => p.providerId === 'google.com');
  const canUnlinkGoogle = canUseGoogleAuth && hasGoogleProvider && providers.length > 1;
  const canLinkGoogle = canUseGoogleAuth && !hasGoogleProvider && providers.length > 0;
  const canUnlinkPassword = hasPasswordProvider && providers.length > 1;
  const canLinkPassword = !hasPasswordProvider && providers.length > 0;

  const handleSecurityAction = (actionType: 'email' | 'password' | 'delete') => {
    navigation.navigate('Security', { actionType });
  };

  const handleDeleteAccount = () => setDeletePromptVisible(true);
  const handleDeleteUser = () => {
    setDeletePromptVisible(false);
    handleSecurityAction('delete');
  };

  const handleLinkGoogleConfirm = async () => {
    setLinkGooglePromptVisible(false);
    try {
      await linkGoogle();
      showToast(authCopy.menu.linkGoogleSuccess, 'success');
    } catch (e) {
      console.warn('menu: link Google account failed', e);
      showToast(getUserFacingErrorMessage(e, authCopy.menu.linkGoogleFailed), 'error');
    }
  };

  const handleLinkPasswordConfirm = async () => {
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
  };

  const handleLinkPasswordCancel = () => {
    setLinkPasswordPromptVisible(false);
    setPasswordLinkEmail('');
    setPasswordLinkPassword('');
    setPasswordLinkConfirm('');
  };

  const handleUnlinkGoogleConfirm = async () => {
    setUnlinkGooglePromptVisible(false);
    try {
      if (!canUnlinkGoogle) throw new Error('Cannot unlink the only provider');
      await unlinkProvider('google.com');
      showToast(authCopy.menu.unlinkGoogleSuccess, 'success');
    } catch (e) {
      console.warn('menu: unlink Google account failed', e);
      showToast(getUserFacingErrorMessage(e, authCopy.menu.unlinkGoogleFailed), 'error');
    }
  };

  const handleUnlinkPasswordConfirm = async () => {
    setUnlinkPasswordPromptVisible(false);
    try {
      if (!canUnlinkPassword) throw new Error('Cannot unlink the only provider');
      await unlinkProvider('password');
      showToast(authCopy.menu.unlinkPasswordSuccess, 'success');
    } catch (e) {
      console.warn('menu: unlink password provider failed', e);
      showToast(getUserFacingErrorMessage(e, authCopy.menu.unlinkPasswordFailed), 'error');
    }
  };

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

  const handleChangeEmail = () => {
    if (!hasGoogleProvider) {
      handleSecurityAction('email');
    } else {
      showToast(authCopy.security.googleLinkedEmailAndroid, 'error');
    }
  };

  return {
    deletePromptVisible,
    setDeletePromptVisible,
    linkGooglePromptVisible,
    setLinkGooglePromptVisible,
    linkPasswordPromptVisible,
    setLinkPasswordPromptVisible,
    unlinkGooglePromptVisible,
    setUnlinkGooglePromptVisible,
    unlinkPasswordPromptVisible,
    setUnlinkPasswordPromptVisible,
    passwordLinkEmail,
    setPasswordLinkEmail,
    passwordLinkPassword,
    setPasswordLinkPassword,
    passwordLinkConfirm,
    setPasswordLinkConfirm,
    hasPasswordProvider,
    hasGoogleProvider,
    canUnlinkGoogle,
    canLinkGoogle,
    canUnlinkPassword,
    canLinkPassword,
    signInMenuItems,
    signOut,
    handleSecurityAction,
    handleDeleteAccount,
    handleDeleteUser,
    handleChangeEmail,
    handleLinkGoogleConfirm,
    handleLinkPasswordConfirm,
    handleLinkPasswordCancel,
    handleUnlinkGoogleConfirm,
    handleUnlinkPasswordConfirm,
  };
}
