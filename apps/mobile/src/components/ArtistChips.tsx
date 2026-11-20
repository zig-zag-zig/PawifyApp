import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import type { ArtistCredit } from "@pawify/shared";
import { SelectableText } from "./ui";

type ArtistChipsProps = {
  artists: readonly ArtistCredit[];
  onArtistPress?: (artistId: string) => void;
};

export const ArtistChips = ({ artists, onArtistPress }: ArtistChipsProps) => {
  if (artists.length === 0) return null;

  return (
    <View style={styles.row}>
      {artists.map((artist, index) => {
        const content = (
          <>
            <MaterialIcons name="person" size={14} color="#81ddff" />
            <SelectableText
              style={styles.text}
              numberOfLines={1}
              ellipsizeMode="tail"
              selectable={false}
            >
              {artist.name}
            </SelectableText>
          </>
        );
        return onArtistPress ? (
          <TouchableOpacity
            key={`${artist.id}-${index}`}
            onPress={() => onArtistPress(artist.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open artist page for ${artist.name}`}
            style={styles.chip}
          >
            {content}
          </TouchableOpacity>
        ) : (
          <View key={`${artist.id}-${index}`} style={styles.chip}>
            {content}
          </View>
        );
      })}
    </View>
  );
};

export const formatArtistCreditNames = (
  artists: readonly ArtistCredit[],
): string =>
  artists
    .map((artist) => `${artist.name}${artist.joinphrase ?? ""}`)
    .join("")
    .trim();

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.52)",
    backgroundColor: "rgba(56, 189, 248, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: "100%",
  },
  text: {
    color: "#81ddff",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    flexShrink: 1,
  },
});
