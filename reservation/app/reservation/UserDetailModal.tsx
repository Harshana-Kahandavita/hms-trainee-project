import React from 'react';
import {
  StyleSheet,
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Define user data structure
interface UserItem {
  id: number;
  name: string;
  email: string;
  address: string;
  phone: string;
  identityNumber: string;
}

// Define what props this component needs
interface UserDetailModalProps {
  visible: boolean;
  user: UserItem | null;
  onClose: () => void;
}

export default function UserDetailModal({
  visible,
  user,
  onClose,
}: UserDetailModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const styles = createStyles(colors);

  // Don't show anything if no user is selected
  if (!user) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.popup}>
          <View style={styles.header}>
            <Text style={styles.title}>Personal Details</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.details}>
              {/* Name */}
              <View style={styles.detailRow}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name="person" size={20} color={colors.tint} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.label}>Name</Text>
                  <Text style={styles.value}>{user.name}</Text>
                </View>
              </View>

              {/* Email */}
              <View style={styles.detailRow}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name="email" size={20} color={colors.tint} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.label}>Email</Text>
                  <Text style={styles.value}>{user.email}</Text>
                </View>
              </View>

              {/* Phone */}
              <View style={styles.detailRow}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name="phone" size={20} color={colors.tint} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.label}>Phone</Text>
                  <Text style={styles.value}>{user.phone}</Text>
                </View>
              </View>

              {/* Address */}
              <View style={styles.detailRow}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name="location-on" size={20} color={colors.tint} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.label}>Address</Text>
                  <Text style={styles.value}>{user.address}</Text>
                </View>
              </View>

              {/* Identity Number */}
              <View style={styles.detailRow}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name="badge" size={20} color={colors.tint} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.label}>Identity Number</Text>
                  <Text style={styles.value}>{user.identityNumber}</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Close button at bottom */}
          <TouchableOpacity style={styles.closeButtonBottom} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    popup: {
      backgroundColor: colors.background,
      borderRadius: 15,
      width: '100%',
      maxWidth: 400,
      maxHeight: '80%',
      padding: 20,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      paddingBottom: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.icon + "30",
    },
    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
    },
    scrollView: {
      maxHeight: 400,
    },
    details: {
      marginBottom: 10,
    },
    detailRow: {
      flexDirection: 'row',
      marginBottom: 20,
      alignItems: 'flex-start',
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.tint + "15",
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    detailContent: {
      flex: 1,
    },
    label: {
      fontSize: 13,
      color: colors.icon,
      marginBottom: 4,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    value: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    closeButtonBottom: {
      backgroundColor: colors.tint,
      padding: 14,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 10,
    },
    closeButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}

