import {
  StyleSheet,
  Platform,
  ScrollView,
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Calendar } from "react-native-calendars";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TablePlacementScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const styles = createStyles(colors);
  const Container = Platform.OS === "web" ? ScrollView : SafeAreaView;
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Get restaurant data from params
  const restaurantName = params.restaurantName as string || "Restaurant";
  const restaurantLocation = params.restaurantLocation as string || "";
  const mealTypes = params.mealType ? JSON.parse(params.mealType as string) : [];
  
  // State management
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedMealType, setSelectedMealType] = useState<string>("");
  const [adults, setAdults] = useState<number>(1);
  const [children, setChildren] = useState<number>(0);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Handle date selection from calendar
  const handleDateSelect = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
    setShowCalendar(false); // Close calendar after selection
  };

  // Format date for display
  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return "Select Date";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Increment/Decrement handlers
  const incrementAdults = () => setAdults(prev => prev + 1);
  const decrementAdults = () => setAdults(prev => Math.max(1, prev - 1));
  const incrementChildren = () => setChildren(prev => prev + 1);
  const decrementChildren = () => setChildren(prev => Math.max(0, prev - 1));

  // Handle booking submission
  const handleBookTable = () => {
    // TODO: Implement booking logic
    console.log({
      restaurantName,
      restaurantLocation,
      date: selectedDate,
      mealType: selectedMealType,
      adults,
      children
    });
    // Navigate back or show success message
    router.back();
  };

  return (
    <Container style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Table Booking</Text>
            <Text style={styles.headerSubtitle}>{restaurantName}</Text>
            {restaurantLocation && (
              <View style={styles.locationRow}>
                <MaterialIcons name="location-on" size={16} color={colors.icon} />
                <Text style={styles.locationText}>{restaurantLocation}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Date Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Date</Text>
          <TouchableOpacity
            style={styles.dateSelectorButton}
            onPress={() => setShowCalendar(!showCalendar)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="calendar-today" size={20} color={colors.tint} />
            <Text style={[styles.dateSelectorText, !selectedDate && styles.dateSelectorPlaceholder]}>
              {selectedDate ? formatDateDisplay(selectedDate) : "Select a date"}
            </Text>
            <MaterialIcons 
              name={showCalendar ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
              size={24} 
              color={colors.icon} 
            />
          </TouchableOpacity>
          {showCalendar && (
            <View style={styles.calendarDropdown}>
              <Calendar
                onDayPress={handleDateSelect}
                markedDates={
                  selectedDate
                    ? {
                        [selectedDate]: {
                          selected: true,
                          selectedColor: colors.tint,
                          selectedTextColor: colors.background,
                        },
                      }
                    : {}
                }
                minDate={getTodayDate()}
                enableSwipeMonths={true}
                theme={{
                  backgroundColor: colors.background,
                  calendarBackground: colors.background,
                  textSectionTitleColor: colors.text,
                  selectedDayBackgroundColor: colors.tint,
                  selectedDayTextColor: colors.background,
                  todayTextColor: colors.tint,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.icon + "50",
                  dotColor: colors.tint,
                  selectedDotColor: colors.background,
                  arrowColor: colors.tint,
                  monthTextColor: colors.text,
                  indicatorColor: colors.tint,
                  textDayFontWeight: "500",
                  textMonthFontWeight: "700",
                  textDayHeaderFontWeight: "600",
                  textDayFontSize: 16,
                  textMonthFontSize: 18,
                  textDayHeaderFontSize: 14,
                }}
                style={styles.calendar}
              />
            </View>
          )}
        </View>

        {/* Meal Type Selector */}
        {mealTypes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Meal Type</Text>
            <View style={styles.mealTypeContainer}>
              {mealTypes.map((mealType: string, index: number) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.mealTypeChip,
                    selectedMealType === mealType && styles.mealTypeChipSelected
                  ]}
                  onPress={() => setSelectedMealType(mealType)}
                >
                  <MaterialIcons 
                    name="restaurant-menu" 
                    size={16} 
                    color={selectedMealType === mealType ? colors.background : colors.tint} 
                  />
                  <Text style={[
                    styles.mealTypeText,
                    selectedMealType === mealType && styles.mealTypeTextSelected
                  ]}>
                    {mealType}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Adults Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Number of Adults</Text>
          <View style={styles.counterContainer}>
            <TouchableOpacity
              style={[styles.counterButton, adults === 1 && styles.counterButtonDisabled]}
              onPress={decrementAdults}
              disabled={adults === 1}
            >
              <MaterialIcons 
                name="remove" 
                size={24} 
                color={adults === 1 ? colors.icon + "50" : colors.text} 
              />
            </TouchableOpacity>
            <View style={styles.counterValue}>
              <Text style={styles.counterText}>{adults}</Text>
            </View>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={incrementAdults}
            >
              <MaterialIcons name="add" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Children Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Number of Children</Text>
          <View style={styles.counterContainer}>
            <TouchableOpacity
              style={[styles.counterButton, children === 0 && styles.counterButtonDisabled]}
              onPress={decrementChildren}
              disabled={children === 0}
            >
              <MaterialIcons 
                name="remove" 
                size={24} 
                color={children === 0 ? colors.icon + "50" : colors.text} 
              />
            </TouchableOpacity>
            <View style={styles.counterValue}>
              <Text style={styles.counterText}>{children}</Text>
            </View>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={incrementChildren}
            >
              <MaterialIcons name="add" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Book Button */}
        <TouchableOpacity
          style={[
            styles.bookButton,
            (!selectedDate || !selectedMealType) && styles.bookButtonDisabled
          ]}
          onPress={handleBookTable}
          disabled={!selectedDate || !selectedMealType}
        >
          <Text style={styles.bookButtonText}>Book Table</Text>
        </TouchableOpacity>
      </ScrollView>
    </Container>
  );
}

function createStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 32,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    headerContent: {
      marginTop: 8,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
    },
    headerSubtitle: {
      fontSize: 20,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
    },
    locationText: {
      fontSize: 14,
      color: colors.icon,
      marginLeft: 4,
      fontWeight: "500",
    },
    section: {
      marginBottom: 32,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 12,
    },
    dateSelectorButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.icon + "30",
      borderRadius: 12,
      padding: 16,
      gap: 12,
    },
    dateSelectorText: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      fontWeight: "500",
    },
    dateSelectorPlaceholder: {
      color: colors.icon,
    },
    calendarDropdown: {
      marginTop: 12,
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.icon + "30",
      backgroundColor: colors.background,
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    calendar: {
      borderRadius: 12,
    },
    mealTypeContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    mealTypeChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.tint + "15",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      gap: 8,
      borderWidth: 2,
      borderColor: "transparent",
    },
    mealTypeChipSelected: {
      backgroundColor: colors.tint,
      borderColor: colors.tint,
    },
    mealTypeText: {
      fontSize: 14,
      color: colors.tint,
      fontWeight: "600",
    },
    mealTypeTextSelected: {
      color: colors.background,
    },
    counterContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
    },
    counterButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.tint + "15",
      justifyContent: "center",
      alignItems: "center",
    },
    counterButtonDisabled: {
      backgroundColor: colors.icon + "10",
    },
    counterValue: {
      minWidth: 60,
      alignItems: "center",
    },
    counterText: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.text,
    },
    bookButton: {
      backgroundColor: colors.tint,
      borderRadius: 12,
      padding: 18,
      alignItems: "center",
      marginTop: 16,
    },
    bookButtonDisabled: {
      backgroundColor: colors.icon + "30",
    },
    bookButtonText: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.background,
    },
  });
}

