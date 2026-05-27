import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { Container, TouchableText } from '../../../components/StyledComponents';
import { RootStackParamList } from '../../../types/navigation';
import SignUpForm from '../components/SignUpForm';

type SignUpNavigationProp = StackNavigationProp<RootStackParamList, 'SignUp'>;

const SignUpPage = () => {
    const navigation = useNavigation<SignUpNavigationProp>();

    return (
        <Container>
            <SignUpForm />
            <TouchableText onPress={() => navigation.navigate('SignIn')}>
                Already have an account? Sign In
            </TouchableText>
        </Container>
    );
};

export default SignUpPage;
