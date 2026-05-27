import React from 'react';
import { CustomButton, CustomInput, Container, Spinner } from '../../../components/StyledComponents';
import { useResetPasswordPage } from '../hooks/useResetPasswordPage';

interface ResetPasswordFormProps {
    tempToken: string;
}

export const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({
    tempToken,
}) => {
    const resetPasswordPage = useResetPasswordPage(tempToken);

    return (
        <Container>
            <Spinner isLoading={resetPasswordPage.state.isLoading} />
            <CustomInput
                placeholder="New Password"
                value={resetPasswordPage.state.newPassword}
                onChangeText={resetPasswordPage.onNewPasswordChanged}
                secureText
                showPasswordToggle
            />
            <CustomInput
                placeholder="Confirm Password"
                value={resetPasswordPage.state.confirmPassword}
                onChangeText={resetPasswordPage.onConfirmPasswordChanged}
                secureText
                showPasswordToggle
            />
            <CustomButton
                onPress={() => void resetPasswordPage.onResetPassword()}
                disabled={resetPasswordPage.state.isLoading}
            >
                Reset Password
            </CustomButton>
        </Container>
    );
};
