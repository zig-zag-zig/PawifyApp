import React from 'react';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../../../types/navigation';
import { ResetPasswordForm } from '../components/ResetPasswordForm';

type ResetPasswordRouteProp = RouteProp<RootStackParamList, 'ResetPassword'>;

const ResetPasswordPage = () => {
    const route = useRoute<ResetPasswordRouteProp>();
    const { tempToken } = route.params;

    return <ResetPasswordForm tempToken={tempToken} />;
};

export default ResetPasswordPage;
