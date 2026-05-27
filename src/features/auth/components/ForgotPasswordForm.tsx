import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { CustomButton, CustomInput, Container, Spinner } from '../../../components/StyledComponents';
import { useForgotPasswordPage } from '../hooks/useForgotPasswordPage';

export const ForgotPasswordForm = () => {
    const forgotPasswordPage = useForgotPasswordPage();

    return (
        <Container>
            <Spinner isLoading={forgotPasswordPage.state.isLoading} />
            <CustomInput
                placeholder="Email"
                value={forgotPasswordPage.state.email}
                onChangeText={forgotPasswordPage.onEmailChanged}
                email
            />

            {forgotPasswordPage.state.step === 'email' ? (
                <>
                    <CustomButton
                        onPress={() => void forgotPasswordPage.onSendOtp()}
                        disabled={forgotPasswordPage.state.isLoading || !forgotPasswordPage.state.email.trim()}
                    >
                        Send OTP
                    </CustomButton>
                    <TouchableOpacity onPress={() => forgotPasswordPage.onStepChanged('otp')}>
                        <Text style={{ color: '#007AFF', marginTop: 16, textAlign: 'center' }}>
                            Already have an OTP?
                        </Text>
                    </TouchableOpacity>
                </>
            ) : (
                <>
                    <CustomInput
                        placeholder="Verification Code"
                        value={forgotPasswordPage.state.otp}
                        onChangeText={forgotPasswordPage.onOtpChanged}
                        numberOnly={true}
                    />
                    <CustomButton
                        onPress={() => void forgotPasswordPage.onVerifyOtp()}
                        disabled={
                            forgotPasswordPage.state.isLoading ||
                            !forgotPasswordPage.state.otp.trim() ||
                            !forgotPasswordPage.state.email.trim()
                        }
                    >
                        Verify OTP
                    </CustomButton>
                    <TouchableOpacity onPress={() => {
                        forgotPasswordPage.onStepChanged('email');
                        forgotPasswordPage.onOtpChanged('');
                    }}>
                        <Text style={{ color: '#007AFF', marginTop: 16, textAlign: 'center' }}>
                            Need a new OTP?
                        </Text>
                    </TouchableOpacity>
                </>
            )}
        </Container>
    );
};
