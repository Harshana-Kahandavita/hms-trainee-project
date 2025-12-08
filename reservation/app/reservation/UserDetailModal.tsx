import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { customerService } from '@/services/customer';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

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
  onUserUpdate?: (updatedUser: UserItem) => void;
}

export default function UserDetailModal({
  visible,
  user,
  onClose,
  onUserUpdate,
}: UserDetailModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const styles = createStyles(colors);

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Initialize email value when user changes or editing starts
  React.useEffect(() => {
    if (user) {
      setEmailValue(user.email || '');
    }
  }, [user]);

  // Don't show anything if no user is selected
  if (!user) {
    return null;
  }

  const handleEditEmail = () => {
    setEmailValue(user.email || '');
    setIsEditingEmail(true);
  };

  const handleCancelEdit = () => {
    setEmailValue(user.email || '');
    setIsEditingEmail(false);
  };

  const handleSaveEmail = async () => {
    if (!user) return;

    // Validate email format if not empty
    if (emailValue.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailValue.trim())) {
        Alert.alert('Invalid Email', 'Please enter a valid email address');
        return;
      }
    }

    setIsUpdating(true);
    try {
      const response = await customerService.updateCustomerEmailAddress(
        user.id,
        emailValue.trim() || null
      );

      if (response.success && response.data) {
        // Update the user object with new email
        const updatedUser: UserItem = {
          ...user,
          email: response.data.email || '',
        };

        // Notify parent component of the update
        if (onUserUpdate) {
          onUserUpdate(updatedUser);
        }

        setIsEditingEmail(false);
        Alert.alert('Success', 'Email address updated successfully');
      } else {
        Alert.alert('Error', response.error || 'Failed to update email address');
      }
    } catch (error) {
      console.error('Error updating email:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to update email address'
      );
    } finally {
      setIsUpdating(false);
    }
  };

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
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Email</Text>
                    {!isEditingEmail && (
                      <TouchableOpacity
                        onPress={handleEditEmail}
                        style={styles.editButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <MaterialIcons name="edit" size={18} color={colors.tint} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {isEditingEmail ? (
                    <View style={styles.editContainer}>
                      <TextInput
                        style={styles.emailInput}
                        value={emailValue}
                        onChangeText={setEmailValue}
                        placeholder="Enter email address"
                        placeholderTextColor={colors.icon}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!isUpdating}
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          onPress={handleCancelEdit}
                          style={[styles.actionButton, styles.cancelButton]}
                          disabled={isUpdating}
                        >
                          <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleSaveEmail}
                          style={[styles.actionButton, styles.saveButton]}
                          disabled={isUpdating}
                        >
                          {isUpdating ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.saveButtonText}>Save</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.value}>{user.email || 'No email'}</Text>
                  )}
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
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    editButton: {
      padding: 4,
    },
    editContainer: {
      marginTop: 4,
    },
    emailInput: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
      borderWidth: 1,
      borderColor: colors.tint + "40",
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.background,
      marginBottom: 8,
    },
    editActions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionButton: {
      flex: 1,
      padding: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: colors.icon + "20",
    },
    saveButton: {
      backgroundColor: colors.tint,
    },
    cancelButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    saveButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
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

