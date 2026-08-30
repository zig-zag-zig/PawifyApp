import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { ScreenContainer, InlineLink } from '../../../components/ui';
import { RootStackParamList } from '../../../types/navigation';
import SignUpForm from '../components/SignUpForm';

type SignUpNavigationProp = StackNavigationProp<RootStackParamList, 'SignUp'>;

const SignUpPage = () => {
    const navigation = useNavigation<SignUpNavigationProp>();

    return (
        <ScreenContainer>
            <SignUpForm />
            <InlineLink onPress={() => navigation.navigate('SignIn')}>
                Already have an account? Sign In
            </InlineLink>
        </ScreenContainer>
    );
};

export default SignUpPage;
