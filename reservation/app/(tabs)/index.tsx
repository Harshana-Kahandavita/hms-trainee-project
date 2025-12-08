import { LogoutHeader } from "@/components/logout-header";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { restaurantService } from "@/services/restaurant.service";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useLayoutEffect, useState, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface RestaurantListItem {
  id: number;
  restaurantName: string;
  restaurantLocation: string;
  mealType?: string[];
  image?: string;
}

export default function RestaurantScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const styles = createStyles(colors);
  const Container = Platform.OS === "web" ? ScrollView : SafeAreaView;
  const router = useRouter();
  const navigation = useNavigation();

  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <LogoutHeader />,
    });
  }, [navigation]);

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await restaurantService.getRestaurants();
        
        if (response.success && response.data) {
          // Map API response to match the expected structure
          const mappedRestaurants: RestaurantListItem[] = response.data.map((restaurant: any) => ({
            id: restaurant.id,
            restaurantName: restaurant.name || 'Restaurant',
            restaurantLocation: restaurant.address || 'Location not available',
            mealType: restaurant.mealType || [],
            image: restaurant.thumbnailImage?.imageUrl || restaurant.heroImage?.imageUrl || restaurant.imageUrl || undefined,
          }));
          setRestaurants(mappedRestaurants);
        } else {
          setError(response.error || 'Failed to fetch restaurants');
        }
      } catch (err) {
        console.error('Error fetching restaurants:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch restaurants');
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurants();
  }, []);

  const handleRestaurantPress = (item: any) => {
    router.push({
      pathname: "/reservation/reservationHistoryData",
      params: {
        restaurantId: item.id.toString()
      },
    });
  };

  if (loading) {
    return (
      <Container style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reserve your Table</Text>
          <Text style={styles.headerSubtitle}>Loading restaurants...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={styles.loadingText}>Loading restaurants...</Text>
        </View>
      </Container>
    );
  }

  if (error) {
    return (
      <Container style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reserve your Table</Text>
        </View>
        <View style={styles.emptyContainer}>
          <MaterialIcons name="error-outline" size={48} color={colors.icon} />
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              setError(null);
              restaurantService.getRestaurants()
                .then((response) => {
                  if (response.success && response.data) {
                    const mappedRestaurants: RestaurantListItem[] = response.data.map((restaurant: any) => ({
                      id: restaurant.id,
                      restaurantName: restaurant.name || 'Restaurant',
                      restaurantLocation: restaurant.address || 'Location not available',
                      mealType: restaurant.mealType || [],
                      image: restaurant.thumbnailImage?.imageUrl || restaurant.heroImage?.imageUrl || restaurant.imageUrl || undefined,
                    }));
                    setRestaurants(mappedRestaurants);
                  } else {
                    setError(response.error || 'Failed to fetch restaurants');
                  }
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : 'Failed to fetch restaurants');
                })
                .finally(() => setLoading(false));
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </Container>
    );
  }

  return (
    <Container style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reserve your Table</Text>
        <Text style={styles.headerSubtitle}>{restaurants.length} restaurant{restaurants.length !== 1 ? 's' : ''} available</Text>
      </View>
      <FlatList
        data={restaurants}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="restaurant" size={48} color={colors.icon} />
            <Text style={styles.emptyText}>No restaurants available</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => handleRestaurantPress(item)}
          >
            {item.image ? (
              <Image 
                source={{ uri: item.image }} 
                style={styles.restaurantImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.restaurantImage}>
                <MaterialIcons name="restaurant" size={48} color={colors.icon} />
              </View>
            )}
            <View style={styles.cardContent}>
              <View style={styles.restaurantHeader}>
                <View style={styles.restaurantInfo}>
                  <Text style={styles.restaurantName} numberOfLines={1}>
                    {item.restaurantName}
                  </Text>
                  <View style={styles.locationRow}>
                    <MaterialIcons name="location-on" size={16} color={colors.icon} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {item.restaurantLocation}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Meal Types Section */}
              {item.mealType && item.mealType.length > 0 && (
                <View style={styles.mealTypesSection}>
                  <View style={styles.mealTypesRow}>
                    {item.mealType.slice(0, 3).map((meal, index) => (
                      <View key={index} style={styles.mealTypeChip}>
                        <MaterialIcons name="restaurant-menu" size={14} color={colors.tint} />
                        <Text style={styles.mealTypeText} numberOfLines={1}>
                          {meal}
                        </Text>
                      </View>
                    ))}
                    {item.mealType.length > 3 && (
                      <View style={styles.mealTypeChip}>
                        <Text style={styles.mealTypeText}>
                          +{item.mealType.length - 3} more
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
            
            {/* Arrow Icon */}
            <View style={styles.arrowContainer}>
              <MaterialIcons name="chevron-right" size={24} color={colors.icon} />
            </View>
          </TouchableOpacity>
        )}
      />
    </Container>
  );
}

function createStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: Platform.OS === "ios" ? 10 : 20,
      paddingBottom: 16,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.icon,
      fontWeight: "500",
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 16,
      color: colors.icon,
      marginTop: 12,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 60,
    },
    loadingText: {
      fontSize: 16,
      color: colors.icon,
      marginTop: 12,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: colors.tint,
      borderRadius: 8,
    },
    retryButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
    card: {
      flexDirection: "row",
      backgroundColor: colors.background,
      borderRadius: 16,
      marginBottom: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 1,
      borderColor: colors.icon + "15",
      maxWidth: Platform.OS === "web" ? 600 : "100%",
      alignSelf: Platform.OS === "web" ? "center" : "stretch",
      width: Platform.OS === "web" ? "100%" : "100%",
    },
    restaurantImage: {
      width: 120,
      height: 140,
      backgroundColor: colors.icon + "10",
    },
    cardContent: {
      flex: 1,
      padding: 16,
      justifyContent: "space-between",
    },
    restaurantHeader: {
      marginBottom: 12,
    },
    restaurantInfo: {
      flex: 1,
    },
    restaurantName: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    locationText: {
      fontSize: 14,
      color: colors.icon,
      marginLeft: 4,
      fontWeight: "500",
    },
    mealTypesSection: {
      marginTop: 8,
    },
    mealTypesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    mealTypeChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.tint + "15",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      gap: 4,
    },
    mealTypeText: {
      fontSize: 12,
      color: colors.tint,
      fontWeight: "600",
    },
    arrowContainer: {
      justifyContent: "center",
      alignItems: "center",
      paddingRight: 12,
    },
  });
}
