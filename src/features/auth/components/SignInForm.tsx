import React from 'react';
import { Keyboard } from 'react-native';
import { useAuthCredentialsPage } from '../hooks/useAuthCredentialsPage';
import AuthForm from './AuthForm';

const SignInForm = () => {
    const authPage = useAuthCredentialsPage('signIn');

    const handleKeyPress = () => {
        if (authPage.state.email.trim().length > 0 && authPage.state.password.length > 0) {
            void authPage.onSubmit();
        } else {
            Keyboard.dismiss();
        }
    };

    return (
        <AuthForm
            mode="signIn"
            email={authPage.state.email}
            password={authPage.state.password}
            isLoading={authPage.state.isLoading}
            setEmail={authPage.onEmailChanged}
            setPassword={authPage.onPasswordChanged}
            onSubmit={() => void authPage.onSubmit()}
            onKeyPress={handleKeyPress}
        />
    );
};

export default SignInForm;
