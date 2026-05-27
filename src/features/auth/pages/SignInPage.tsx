import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { Container, TouchableText } from '../../../components/StyledComponents';
import { RootStackParamList } from '../../../types/navigation';
import SignInForm from '../components/SignInForm';

type SignInNavigationProp = StackNavigationProp<RootStackParamList, 'SignIn'>;

const SignInPage = () => {
    const navigation = useNavigation<SignInNavigationProp>();

    return (
        <Container>
            <SignInForm />
            <TouchableText onPress={() => navigation.navigate('SignUp')}>
                Don't have an account? Sign Up
            </TouchableText>
            <TouchableText onPress={() => navigation.navigate('ForgotPassword')}>
                Forgot Password?
            </TouchableText>
        </Container>
    );
};

export default SignInPage;
