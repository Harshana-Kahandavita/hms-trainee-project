import { LogoutHeader } from "@/components/logout-header";
import { RESERVATION_HISTORY_DATA } from "@/constants/reservationHistoryData";
import { Colors } from "@/constants/theme";
import { USER_DATA } from "@/constants/userData";
import { useColorScheme } from "@/hooks/use-color-scheme";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import {
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

  const getUserName = (userId: string): string => {
    try {
      if (!USER_DATA || !Array.isArray(USER_DATA)) {
        return "Unknown User";
      }
      const user = USER_DATA.find((u) => u.id.toString() === userId.toString());
      return user?.name || "Unknown User";
    } catch {
      return "Unknown User";
    }
  };

  const getUserData = (userId: string) => {
    try {
      if (!USER_DATA || !Array.isArray(USER_DATA)) {
        return null;
      }
      return USER_DATA.find((u) => u.id.toString() === userId.toString()) || null;
    } catch {
      return null;
    }
  };

  const handleCardPress = (reservation: any) => {
    const user = getUserData(reservation.userId);
    if (user) {
      setSelectedUser(user);
      setModalVisible(true);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedUser(null);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <LogoutHeader />,
      title: "Reservation History",
    });
  }, [navigation]);

  // Filter reservations by restaurant ID
  const filteredReservations = useMemo(() => {
    if (!restaurantId) return [];
    return RESERVATION_HISTORY_DATA.filter(
      (reservation) => reservation.resturantId === restaurantId.toString()
    );
  }, [restaurantId]);

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
                      {getUserName(item.userId)}
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

