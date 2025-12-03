import {
  StyleSheet,
  Platform,
  ScrollView,
  SafeAreaView,
  FlatList,
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import { useState } from "react";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { RESERVATION_DATA } from "@/constants/reservationData";
import ReservationDetailModal from "@/app/reservation/ReservationDetailModal";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";


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

export default function ReservationsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const styles = createStyles(colors);
  const Container = Platform.OS === "web" ? ScrollView : SafeAreaView;
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleItemPress = (item: any) => {
    setSelectedReservation(item);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedReservation(null);
  };

  return (
    <Container style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Reservations</Text>
        <Text style={styles.headerSubtitle}>{RESERVATION_DATA.length} total reservations</Text>
      </View>
      <FlatList 
        data={RESERVATION_DATA}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card}
            onPress={() => handleItemPress(item)}
            activeOpacity={0.8}
          >
            <View style={styles.cardContent}>
              {/* Restaurant Icon and Name Section */}
              <View style={styles.restaurantHeader}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name="restaurant" size={28} color={colors.tint} />
                </View>
                <View style={styles.restaurantInfo}>
                  <Text style={styles.restaurantName} numberOfLines={1}>
                    {item.resturantName}
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
            
            {/* Arrow Icon */}
            <View style={styles.arrowContainer}>
              <MaterialIcons name="chevron-right" size={24} color={colors.icon} />
            </View>
          </TouchableOpacity>
        )}              
      />
      <ReservationDetailModal
        visible={modalVisible}
        reservation={selectedReservation}
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
    reservationNumber: {
      fontSize: 13,
      color: colors.icon,
      fontWeight: "500",
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
    arrowContainer: {
      justifyContent: "center",
      alignItems: "center",
      marginLeft: 8,
    },
  });
}
