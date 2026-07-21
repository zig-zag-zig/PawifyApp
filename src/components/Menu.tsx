import { View, ScrollView } from 'react-native';
import { ScreenContainer } from './ui';
import { getMenuStyles } from './menu/menuStyles';
import { UpdateMenuSection } from './menu/UpdateMenuSection';
import { useAccountSecurityController } from './menu/useAccountSecurityController';
import { AccountSecurityRows } from './menu/AccountSecurityRows';
import { AccountSecurityOverlays } from './menu/AccountSecurityOverlays';
import { ReleaseNotificationSettingsCard } from '../features/userSettings/components/ReleaseNotificationSettingsCard';

export default function Menu() {
  const styles = getMenuStyles();
  const security = useAccountSecurityController();

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <UpdateMenuSection />

        <View style={styles.section}>
          <View style={styles.menuCard}>
            <ReleaseNotificationSettingsCard />
          </View>
        </View>

        <AccountSecurityRows
          hasPasswordProvider={security.hasPasswordProvider}
          signInMenuItems={security.signInMenuItems}
          signOut={security.signOut}
          handleChangeEmail={security.handleChangeEmail}
          handleSecurityAction={security.handleSecurityAction}
          handleDeleteAccount={security.handleDeleteAccount}
        />
      </ScrollView>

      <AccountSecurityOverlays
        deletePromptVisible={security.deletePromptVisible}
        linkGooglePromptVisible={security.linkGooglePromptVisible}
        linkPasswordPromptVisible={security.linkPasswordPromptVisible}
        unlinkGooglePromptVisible={security.unlinkGooglePromptVisible}
        unlinkPasswordPromptVisible={security.unlinkPasswordPromptVisible}
        passwordLinkEmail={security.passwordLinkEmail}
        passwordLinkPassword={security.passwordLinkPassword}
        passwordLinkConfirm={security.passwordLinkConfirm}
        setPasswordLinkEmail={security.setPasswordLinkEmail}
        setPasswordLinkPassword={security.setPasswordLinkPassword}
        setPasswordLinkConfirm={security.setPasswordLinkConfirm}
        canUnlinkGoogle={security.canUnlinkGoogle}
        canUnlinkPassword={security.canUnlinkPassword}
        handleDeleteUser={security.handleDeleteUser}
        handleLinkGoogleConfirm={security.handleLinkGoogleConfirm}
        handleLinkPasswordConfirm={security.handleLinkPasswordConfirm}
        handleLinkPasswordCancel={security.handleLinkPasswordCancel}
        handleUnlinkGoogleConfirm={security.handleUnlinkGoogleConfirm}
        handleUnlinkPasswordConfirm={security.handleUnlinkPasswordConfirm}
        setDeletePromptVisible={security.setDeletePromptVisible}
        setLinkGooglePromptVisible={security.setLinkGooglePromptVisible}
        setUnlinkGooglePromptVisible={security.setUnlinkGooglePromptVisible}
        setUnlinkPasswordPromptVisible={security.setUnlinkPasswordPromptVisible}
      />
    </ScreenContainer>
  );
}
