import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { ScreenContainer, InlineLink } from '../../../components/ui';
import { RootStackParamList } from '../../../types/navigation';
import SignInForm from '../components/SignInForm';

type SignInNavigationProp = StackNavigationProp<RootStackParamList, 'SignIn'>;

const SignInPage = () => {
    const navigation = useNavigation<SignInNavigationProp>();

    return (
        <ScreenContainer>
            <SignInForm />
            <InlineLink onPress={() => navigation.navigate('SignUp')}>
                Don't have an account? Sign Up
            </InlineLink>
            <InlineLink onPress={() => navigation.navigate('ForgotPassword')}>
                Forgot Password?
            </InlineLink>
        </ScreenContainer>
    );
};

export default SignInPage;
