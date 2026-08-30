import { FontAwesome6, Fontisto, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BRAND_ICON_PATHS } from './brandIconPaths';
import type { ExternalLinkIconConfig } from './externalLinkRanking';

type FontAwesome6Icon = React.ComponentType<{
    name: string;
    size: number;
    color: string;
    brand?: boolean;
    solid?: boolean;
}>;

const FeaturedFontAwesome6 = FontAwesome6 as FontAwesome6Icon;

interface ExternalLinkIconProps {
    icon: ExternalLinkIconConfig;
    color: string;
    size: number;
}

const WIKIDATA_BARS = [
    { backgroundColor: '#990000', left: 0.08, height: 0.46 },
    { backgroundColor: '#339966', left: 0.24, height: 0.68 },
    { backgroundColor: '#006699', left: 0.4, height: 0.54 },
    { backgroundColor: '#990000', left: 0.56, height: 0.76 },
    { backgroundColor: '#339966', left: 0.72, height: 0.48 },
];

export const ExternalLinkIcon = ({ icon, color, size }: ExternalLinkIconProps) => {
    if (icon.family === 'fontAwesome6') {
        return (
            <FeaturedFontAwesome6
                name={icon.name}
                size={size}
                color={color}
                brand={icon.brand}
                solid={icon.solid}
            />
        );
    }

    if (icon.family === 'fontisto') {
        return (
            <Fontisto
                name={icon.name as React.ComponentProps<typeof Fontisto>['name']}
                size={size}
                color={color}
            />
        );
    }

    if (icon.family === 'text') {
        return (
            <Text
                style={[
                    styles.textLogo,
                    {
                        color,
                        fontSize: Math.max(11, Math.round(size * 0.58)),
                    },
                ]}
            >
                {icon.text}
            </Text>
        );
    }

    if (icon.family === 'brandSvg') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24">
                <Path d={BRAND_ICON_PATHS[icon.slug]} fill={color} />
            </Svg>
        );
    }

    if (icon.family === 'wikidata') {
        return (
            <View style={[styles.wikidataLogo, { width: size, height: size }]}>
                {WIKIDATA_BARS.map(({ backgroundColor, left, height }, index) => (
                    <View
                        key={`wikidata-${index}`}
                        style={[
                            styles.wikidataBar,
                            {
                                backgroundColor,
                                left: Math.round(size * left),
                                height: Math.round(size * height),
                            },
                        ]}
                    />
                ))}
            </View>
        );
    }

    return (
        <MaterialCommunityIcons
            name={icon.name as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
            size={size}
            color={color}
        />
    );
};

const styles = StyleSheet.create({
    textLogo: {
        fontWeight: '900',
        lineHeight: 18,
    },
    wikidataLogo: {
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    wikidataBar: {
        position: 'absolute',
        bottom: 2,
        width: 3,
        borderRadius: 2,
    },
});
