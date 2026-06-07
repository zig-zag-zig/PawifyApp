import React from 'react';
import {
    Button,
    TextField,
    ScreenContainer,
    Spinner
} from '../../../components/ui';
import type { SecurityActionType } from '../model/types';
import { useSecurityPage } from '../hooks/useSecurityPage';

export const SecurityForm = ({ actionType }: { actionType: SecurityActionType }) => {
    const securityPage = useSecurityPage(actionType);

    return (
        <ScreenContainer>
            <Spinner isLoading={securityPage.state.isLoading} />

            {securityPage.needsPasswordField && (
                <TextField
                    placeholder={actionType === 'delete' ? 'Password' : 'Current Password'}
                    value={securityPage.state.currentPassword}
                    onChangeText={securityPage.onCurrentPasswordChanged}
                    secureText
                    showPasswordToggle
                    autoComplete="password"
                    textContentType="password"
                    editable={!securityPage.state.isFormDisabled}
                    style={securityPage.state.isFormDisabled ? { opacity: 0.6 } : undefined}
                />
            )}

            {!securityPage.needsPasswordField && actionType !== 'password' && (
                <TextField
                    placeholder={securityPage.reauthPromptMessage ?? 'Authentication is unavailable'}
                    value=""
                    onChangeText={() => { }}
                    editable={false}
                    style={{ opacity: 0.6 }}
                />
            )}

            {actionType !== 'delete' && (
                <>
                    <TextField
                        placeholder={actionType === 'email' ? 'New Email' : 'New Password'}
                        value={securityPage.state.newValue}
                        onChangeText={securityPage.onNewValueChanged}
                        secureText={actionType === 'password'}
                        showPasswordToggle={actionType === 'password'}
                        autoComplete={actionType === 'email' ? 'email' : 'new-password'}
                        textContentType={actionType === 'email' ? 'emailAddress' : 'newPassword'}
                        editable={!securityPage.state.isFormDisabled}
                        style={securityPage.state.isFormDisabled ? { opacity: 0.6 } : undefined}
                    />

                    <TextField
                        placeholder={actionType === 'email' ? 'Confirm New Email' : 'Confirm New Password'}
                        value={securityPage.state.confirmValue}
                        onChangeText={securityPage.onConfirmValueChanged}
                        secureText={actionType === 'password'}
                        showPasswordToggle={actionType === 'password'}
                        autoComplete={actionType === 'email' ? 'email' : 'new-password'}
                        textContentType={actionType === 'email' ? 'emailAddress' : 'newPassword'}
                        editable={!securityPage.state.isFormDisabled}
                        style={securityPage.state.isFormDisabled ? { opacity: 0.6 } : undefined}
                    />
                </>
            )}

            <Button
                onPress={() => void securityPage.onSubmit()}
                disabled={
                    securityPage.state.isFormDisabled ||
                    securityPage.state.isLoading ||
                    (securityPage.needsPasswordField && !securityPage.state.currentPassword) ||
                    (actionType !== 'delete' &&
                        (!securityPage.state.newValue || !securityPage.state.confirmValue))
                }
            >
                {securityPage.buttonText}
            </Button>
        </ScreenContainer>
    );
};
