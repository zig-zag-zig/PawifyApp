import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Button, TextField, ScreenContainer, Spinner } from '../../../components/ui';
import { authCopy } from '../domain/authCopy';
import { useForgotPasswordPage } from '../hooks/useForgotPasswordPage';

export const ForgotPasswordForm = () => {
    const forgotPasswordPage = useForgotPasswordPage();

    return (
        <ScreenContainer>
            <Spinner isLoading={forgotPasswordPage.state.isLoading} />
            <TextField
                placeholder="Email"
                value={forgotPasswordPage.state.email}
                onChangeText={forgotPasswordPage.onEmailChanged}
                email
            />

            {forgotPasswordPage.state.step === 'email' ? (
                <>
                    <Button
                        onPress={() => void forgotPasswordPage.onSendOtp()}
                        disabled={forgotPasswordPage.state.isLoading || !forgotPasswordPage.state.email.trim()}
                    >
                        {authCopy.forgotPassword.sendCode}
                    </Button>
                    <TouchableOpacity onPress={() => forgotPasswordPage.onStepChanged('otp')}>
                        <Text style={{ color: '#007AFF', marginTop: 16, textAlign: 'center' }}>
                            {authCopy.forgotPassword.alreadyHaveCode}
                        </Text>
                    </TouchableOpacity>
                </>
            ) : (
                <>
                    <TextField
                        placeholder="Verification Code"
                        value={forgotPasswordPage.state.otp}
                        onChangeText={forgotPasswordPage.onOtpChanged}
                        numberOnly={true}
                    />
                    <Button
                        onPress={() => void forgotPasswordPage.onVerifyOtp()}
                        disabled={
                            forgotPasswordPage.state.isLoading ||
                            !forgotPasswordPage.state.otp.trim() ||
                            !forgotPasswordPage.state.email.trim()
                        }
                    >
                        {authCopy.forgotPassword.verifyCode}
                    </Button>
                    <TouchableOpacity onPress={() => {
                        forgotPasswordPage.onStepChanged('email');
                        forgotPasswordPage.onOtpChanged('');
                    }}>
                        <Text style={{ color: '#007AFF', marginTop: 16, textAlign: 'center' }}>
                            {authCopy.forgotPassword.needNewCode}
                        </Text>
                    </TouchableOpacity>
                </>
            )}
        </ScreenContainer>
    );
};
