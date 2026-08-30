import React from 'react';
import { View } from 'react-native';
import { MenuItem } from './MenuItem';
import { getMenuStyles } from './menuStyles';

interface AccountSecurityRowsProps {
  hasPasswordProvider: boolean;
  signInMenuItems: Array<{
    icon: string;
    label: string;
    onPress: () => void;
    danger?: boolean;
  }>;
  signOut: () => Promise<void>;
  handleChangeEmail: () => void;
  handleSecurityAction: (actionType: 'email' | 'password' | 'delete') => void;
  handleDeleteAccount: () => void;
}

export function AccountSecurityRows({
  hasPasswordProvider,
  signInMenuItems,
  signOut,
  handleChangeEmail,
  handleSecurityAction,
  handleDeleteAccount,
}: AccountSecurityRowsProps) {
  const styles = getMenuStyles();

  return (
    <>
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
                onPress={handleChangeEmail}
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
    </>
  );
}
