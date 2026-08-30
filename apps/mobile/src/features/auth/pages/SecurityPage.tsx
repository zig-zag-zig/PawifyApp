import React from 'react';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../../../types/navigation';
import { SecurityForm } from '../components/SecurityForm';

type SecurityRouteProp = RouteProp<RootStackParamList, 'Security'>;

const SecurityPage = () => {
    const route = useRoute<SecurityRouteProp>();
    const { actionType } = route.params;

    return <SecurityForm actionType={actionType} />;
};

export default SecurityPage;
