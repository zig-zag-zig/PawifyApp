import React from 'react';
import { Keyboard } from 'react-native';
import { useAuthCredentialsPage } from '../hooks/useAuthCredentialsPage';
import AuthForm from './AuthForm';

const SignUpForm = () => {
    const authPage = useAuthCredentialsPage('signUp');

    const handleKeyPress = () => {
        if (
            authPage.state.email.trim().length > 0 &&
            authPage.state.password.length > 0 &&
            authPage.state.confirmPassword.length > 0
        ) {
            void authPage.onSubmit();
        } else {
            Keyboard.dismiss();
        }
    };

    return (
        <AuthForm
            mode="signUp"
            email={authPage.state.email}
            password={authPage.state.password}
            confirmPassword={authPage.state.confirmPassword}
            isLoading={authPage.state.isLoading}
            setEmail={authPage.onEmailChanged}
            setPassword={authPage.onPasswordChanged}
            setConfirmPassword={authPage.onConfirmPasswordChanged}
            onSubmit={() => void authPage.onSubmit()}
            onKeyPress={handleKeyPress}
        />
    );
};

export default SignUpForm;
