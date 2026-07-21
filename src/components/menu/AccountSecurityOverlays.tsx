import React from 'react';
import { ConfirmationPrompt } from '../ConfirmationPrompt';
import { LinkPasswordModal } from './LinkPasswordModal';
import { authCopy } from '../../features/auth/domain/authCopy';

interface AccountSecurityOverlaysProps {
  deletePromptVisible: boolean;
  linkGooglePromptVisible: boolean;
  linkPasswordPromptVisible: boolean;
  unlinkGooglePromptVisible: boolean;
  unlinkPasswordPromptVisible: boolean;
  passwordLinkEmail: string;
  passwordLinkPassword: string;
  passwordLinkConfirm: string;
  setPasswordLinkEmail: (text: string) => void;
  setPasswordLinkPassword: (text: string) => void;
  setPasswordLinkConfirm: (text: string) => void;
  canUnlinkGoogle: boolean;
  canUnlinkPassword: boolean;
  handleDeleteUser: () => void;
  handleLinkGoogleConfirm: () => void;
  handleLinkPasswordConfirm: () => void;
  handleLinkPasswordCancel: () => void;
  handleUnlinkGoogleConfirm: () => void;
  handleUnlinkPasswordConfirm: () => void;
  setDeletePromptVisible: (visible: boolean) => void;
  setLinkGooglePromptVisible: (visible: boolean) => void;
  setUnlinkGooglePromptVisible: (visible: boolean) => void;
  setUnlinkPasswordPromptVisible: (visible: boolean) => void;
}

export function AccountSecurityOverlays({
  deletePromptVisible,
  linkGooglePromptVisible,
  linkPasswordPromptVisible,
  unlinkGooglePromptVisible,
  unlinkPasswordPromptVisible,
  passwordLinkEmail,
  passwordLinkPassword,
  passwordLinkConfirm,
  setPasswordLinkEmail,
  setPasswordLinkPassword,
  setPasswordLinkConfirm,
  canUnlinkGoogle,
  canUnlinkPassword,
  handleDeleteUser,
  handleLinkGoogleConfirm,
  handleLinkPasswordConfirm,
  handleLinkPasswordCancel,
  handleUnlinkGoogleConfirm,
  handleUnlinkPasswordConfirm,
  setDeletePromptVisible,
  setLinkGooglePromptVisible,
  setUnlinkGooglePromptVisible,
  setUnlinkPasswordPromptVisible,
}: AccountSecurityOverlaysProps) {
  return (
    <>
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
        onConfirm={handleLinkGoogleConfirm}
        onCancel={() => setLinkGooglePromptVisible(false)}
      />
      {linkPasswordPromptVisible && (
        <LinkPasswordModal
          visible={linkPasswordPromptVisible}
          email={passwordLinkEmail}
          password={passwordLinkPassword}
          confirmPassword={passwordLinkConfirm}
          onEmailChange={setPasswordLinkEmail}
          onPasswordChange={setPasswordLinkPassword}
          onConfirmPasswordChange={setPasswordLinkConfirm}
          onConfirm={handleLinkPasswordConfirm}
          onCancel={handleLinkPasswordCancel}
        />
      )}
      <ConfirmationPrompt
        visible={unlinkGooglePromptVisible}
        message={canUnlinkGoogle ? authCopy.menu.unlinkGooglePrompt : authCopy.menu.unlinkOnlyProvider}
        confirmText="Unlink"
        cancelText="Cancel"
        danger={true}
        onConfirm={handleUnlinkGoogleConfirm}
        onCancel={() => setUnlinkGooglePromptVisible(false)}
      />
      <ConfirmationPrompt
        visible={unlinkPasswordPromptVisible}
        message={canUnlinkPassword ? authCopy.menu.unlinkPasswordPrompt : authCopy.menu.unlinkOnlyProvider}
        confirmText="Unlink"
        cancelText="Cancel"
        danger={true}
        onConfirm={handleUnlinkPasswordConfirm}
        onCancel={() => setUnlinkPasswordPromptVisible(false)}
      />
    </>
  );
}
