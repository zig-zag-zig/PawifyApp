import React from 'react';
import { Button, TextField, ScreenContainer, Spinner } from '../../../components/ui';
import { useResetPasswordPage } from '../hooks/useResetPasswordPage';

interface ResetPasswordFormProps {
    tempToken: string;
}

export const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({
    tempToken,
}) => {
    const resetPasswordPage = useResetPasswordPage(tempToken);

    return (
        <ScreenContainer>
            <Spinner isLoading={resetPasswordPage.state.isLoading} />
            <TextField
                placeholder="New Password"
                value={resetPasswordPage.state.newPassword}
                onChangeText={resetPasswordPage.onNewPasswordChanged}
                secureText
                showPasswordToggle
            />
            <TextField
                placeholder="Confirm Password"
                value={resetPasswordPage.state.confirmPassword}
                onChangeText={resetPasswordPage.onConfirmPasswordChanged}
                secureText
                showPasswordToggle
            />
            <Button
                onPress={() => void resetPasswordPage.onResetPassword()}
                disabled={resetPasswordPage.state.isLoading}
            >
                Reset Password
            </Button>
        </ScreenContainer>
    );
};
