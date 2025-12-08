import { LogoutHeader } from "@/components/logout-header";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { customerService } from "@/services/customer";
import { reservationService } from "@/services/reservation.service";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useLayoutEffect, useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import UserDetailModal from "./UserDetailModal";

function formatReservationDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return dateString; // Return original string if invalid
    }
    
    // Format as "Month Day, Year" (e.g., "October 1, 2025")
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    return date.toLocaleDateString('en-US', options);
  } catch {
    return dateString; // Return original string if parsing fails
  }
}

function formatReservationTime(timeString: string): string {
  try {
    const date = new Date(timeString);
    if (isNaN(date.getTime())) {
      return timeString;
    }
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return timeString;
  }
}

interface ReservationListItem {
  id: number;
  resturantId: string;
  resturantName: string;
  reservationDate: string;
  reservationTime: string;
  adultCount: number;
  childCount: number;
  payment: string;
  userId: string;
  customerName: string;
}

export default function ReservationHistoryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const styles = createStyles(colors);
  const Container = Platform.OS === "web" ? ScrollView : SafeAreaView;
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const restaurantId = params.restaurantId || params.restaurantName;
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [reservations, setReservations] = useState<ReservationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerCache, setCustomerCache] = useState<Map<number, any>>(new Map());
  const [loadingCustomers, setLoadingCustomers] = useState<Set<number>>(new Set());
  const [customerCacheVersion, setCustomerCacheVersion] = useState(0);

  // Fetch customer data and cache it (only called when card is tapped)
  const fetchCustomer = useCallback(async (customerId: number) => {
    // Check cache first
    if (customerCache.has(customerId)) {
      return customerCache.get(customerId);
    }

    // Check if already loading
    if (loadingCustomers.has(customerId)) {
      return null;
    }

    try {
      setLoadingCustomers(prev => new Set(prev).add(customerId));
      const response = await customerService.getCustomerById(customerId);
      
      if (response.success && response.data) {
        // Map customer data to match UserDetailModal structure
        const mappedCustomer = {
          id: response.data.id,
          name: `${response.data.firstName} ${response.data.lastName}`,
          email: response.data.email || '',
          address: '', // Not available in customer data
          phone: response.data.phone,
          identityNumber: '', // Not available in customer data
        };
        
        // Cache the customer and trigger re-render to update name in list
        setCustomerCache(prev => new Map(prev).set(customerId, mappedCustomer));
        setCustomerCacheVersion(prev => prev + 1);
        return mappedCustomer;
      }
      return null;
    } catch (err) {
      console.error(`Error fetching customer ${customerId}:`, err);
      return null;
    } finally {
      setLoadingCustomers(prev => {
        const newSet = new Set(prev);
        newSet.delete(customerId);
        return newSet;
      });
    }
  }, [customerCache, loadingCustomers]);


  const handleCardPress = async (reservation: any) => {
    const customerId = parseInt(reservation.userId, 10);
    if (isNaN(customerId)) {
      return;
    }

    // Always fetch customer data when card is tapped (check cache first)
    const user = await fetchCustomer(customerId);

    if (user) {
      setSelectedUser(user);
      setModalVisible(true);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedUser(null);
  };

  const handleUserUpdate = (updatedUser: any) => {
    // Update the selected user in the modal
    setSelectedUser(updatedUser);
    
    // Update the customer cache
    if (updatedUser && updatedUser.id) {
      setCustomerCache(prev => {
        const newCache = new Map(prev);
        newCache.set(updatedUser.id, updatedUser);
        return newCache;
      });
      setCustomerCacheVersion(prev => prev + 1);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <LogoutHeader />,
      title: "Reservation History",
    });
  }, [navigation]);

  useEffect(() => {
    const fetchReservations = async () => {
      if (!restaurantId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const restaurantIdNum = parseInt(restaurantId.toString(), 10);
        
        if (isNaN(restaurantIdNum)) {
          setError('Invalid restaurant ID');
          setLoading(false);
          return;
        }

        const response = await reservationService.getReservationsByRestaurantId(restaurantIdNum);
        
        if (response.success && response.data) {
          // Map API response to match the expected structure
          const mappedReservations: ReservationListItem[] = response.data.map((reservation: any) => ({
            id: reservation.id,
            resturantId: reservation.restaurantId.toString(),
            resturantName: reservation.restaurant?.name || 'Restaurant',
            reservationDate: reservation.reservationDate,
            reservationTime: reservation.reservationTime,
            adultCount: reservation.adultCount,
            childCount: reservation.childCount,
            payment: reservation.totalAmount?.toString() || '0',
            userId: reservation.customerId?.toString() || reservation.customer?.id?.toString() || '',
            customerName: reservation.customer 
              ? `${reservation.customer.firstName || ''} ${reservation.customer.lastName || ''}`.trim() || 'Customer'
              : 'Customer',
          }));
          setReservations(mappedReservations);
        } else {
          setError(response.error || 'Failed to fetch reservations');
        }
      } catch (err) {
        console.error('Error fetching reservations:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch reservations');
      } finally {
        setLoading(false);
      }
    };

    fetchReservations();
  }, [restaurantId]);

  // Use reservations from state
  // Reference customerCacheVersion to trigger re-render when customer names are loaded
  const filteredReservations = reservations;
  void customerCacheVersion; // Force re-render when cache updates

  if (loading) {
    return (
      <Container style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reservation History</Text>
          <Text style={styles.headerSubtitle}>Loading reservations...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={styles.loadingText}>Loading reservations...</Text>
        </View>
      </Container>
    );
  }

  if (error) {
    return (
      <Container style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reservation History</Text>
        </View>
        <View style={styles.emptyContainer}>
          <MaterialIcons name="error-outline" size={64} color={colors.icon} />
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              setError(null);
              // Retry fetch
              const restaurantIdNum = parseInt(restaurantId?.toString() || '0', 10);
              if (!isNaN(restaurantIdNum)) {
                reservationService.getReservationsByRestaurantId(restaurantIdNum)
                  .then((response) => {
                    if (response.success && response.data) {
                      const mappedReservations: ReservationListItem[] = response.data.map((reservation: any) => ({
                        id: reservation.id,
                        resturantId: reservation.restaurantId.toString(),
                        resturantName: reservation.restaurant?.name || 'Restaurant',
                        reservationDate: reservation.reservationDate,
                        reservationTime: reservation.reservationTime,
                        adultCount: reservation.adultCount,
                        childCount: reservation.childCount,
                        payment: reservation.totalAmount?.toString() || '0',
                        userId: reservation.customerId?.toString() || reservation.customer?.id?.toString() || '',
                        customerName: reservation.customer 
                          ? `${reservation.customer.firstName || ''} ${reservation.customer.lastName || ''}`.trim() || 'Customer'
                          : 'Customer',
                      }));
                      setReservations(mappedReservations);
                    } else {
                      setError(response.error || 'Failed to fetch reservations');
                    }
                  })
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : 'Failed to fetch reservations');
                  })
                  .finally(() => setLoading(false));
              }
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
        <Text style={styles.headerTitle}>Reservation History</Text>
        <Text style={styles.headerSubtitle}>
          {filteredReservations.length} reservation{filteredReservations.length !== 1 ? 's' : ''} found
        </Text>
      </View>
      {filteredReservations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="event-busy" size={64} color={colors.icon} />
          <Text style={styles.emptyText}>No reservations found</Text>
          <Text style={styles.emptySubtext}>There are no reservations for this restaurant yet.</Text>
        </View>
      ) : (
        <FlatList 
          data={filteredReservations}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => handleCardPress(item)}
            >
              <View style={styles.cardContent}>
                {/* Person Icon and Name Section */}
                <View style={styles.restaurantHeader}>
                  <View style={styles.iconContainer}>
                    <MaterialIcons name="person" size={28} color={colors.tint} />
                  </View>
                  <View style={styles.restaurantInfo}>
                    <Text style={styles.restaurantName} numberOfLines={1}>
                      {item.customerName}
                    </Text>
                  </View>
                </View>

                {/* Date and Time Section */}
                <View style={styles.dateTimeSection}>
                  <View style={styles.dateTimeRow}>
                    <MaterialIcons name="calendar-today" size={16} color={colors.icon} />
                    <Text style={styles.dateTimeText}>
                      {formatReservationDate(item.reservationDate)}
                    </Text>
                  </View>
                  <View style={styles.dateTimeRow}>
                    <MaterialIcons name="access-time" size={16} color={colors.icon} />
                    <Text style={styles.dateTimeText}>
                      {formatReservationTime(item.reservationTime)}
                    </Text>
                  </View>
                </View>

                {/* Guests Section */}
                <View style={styles.guestsSection}>
                  <View style={styles.guestItem}>
                    <MaterialIcons name="person" size={18} color={colors.icon} />
                    <Text style={styles.guestText}>{item.adultCount} Adult{item.adultCount !== 1 ? 's' : ''}</Text>
                  </View>
                  {item.childCount > 0 && (
                    <View style={styles.guestItem}>
                      <MaterialIcons name="child-care" size={18} color={colors.icon} />
                      <Text style={styles.guestText}>{item.childCount} Child{item.childCount !== 1 ? 'ren' : ''}</Text>
                    </View>
                  )}
                </View>

                {/* Payment Section */}
                <View style={styles.paymentSection}>
                  <View style={styles.paymentRow}>
                    <MaterialIcons name="payments" size={20} color="#2e7d32" />
                    <Text style={styles.paymentLabel}>Total Payment</Text>
                  </View>
                  <Text style={styles.paymentAmount}>Rs. {item.payment}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}              
        />
      )}
      <UserDetailModal
        visible={modalVisible}
        user={selectedUser}
        onClose={handleCloseModal}
        onUserUpdate={handleUserUpdate}
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
      paddingHorizontal: 40,
    },
    emptyText: {
      fontSize: 18,
      color: colors.text,
      marginTop: 16,
      fontWeight: "600",
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.icon,
      marginTop: 8,
      textAlign: "center",
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
      padding: 16,
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
    cardContent: {
      flex: 1,
    },
    restaurantHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.tint + "15",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    restaurantInfo: {
      flex: 1,
    },
    restaurantName: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
    },
    dateTimeSection: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 12,
      gap: 12,
    },
    dateTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: 16,
    },
    dateTimeText: {
      fontSize: 14,
      color: colors.text,
      marginLeft: 6,
      fontWeight: "500",
    },
    guestsSection: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 12,
      gap: 12,
    },
    guestItem: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: 16,
    },
    guestText: {
      fontSize: 13,
      color: colors.icon,
      marginLeft: 6,
    },
    paymentSection: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.icon + "20",
    },
    paymentRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    paymentLabel: {
      fontSize: 14,
      color: colors.icon,
      marginLeft: 6,
      fontWeight: "500",
    },
    paymentAmount: {
      fontSize: 20,
      fontWeight: "700",
      color: "#2e7d32",
    },
  });
}

