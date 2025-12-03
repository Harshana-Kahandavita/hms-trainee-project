import React from 'react';
import {
  StyleSheet,
  Modal,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';

// Define what data a reservation has
interface ReservationItem {
  id: number;
  reservationNumber: string;
  resturantName: string;
  reservationDate: string;
  reservationTime: string;
  adultCount: number;
  childCount: number;
  payment: string;
}

// Define what props this component needs
interface ReservationDetailModalProps {
  visible: boolean;
  reservation: ReservationItem | null;
  onClose: () => void;
}

// Format date to readable format
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Format time to readable format
function formatTime(timeString: string): string {
  const date = new Date(timeString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export default function ReservationDetailModal({
  visible,
  reservation,
  onClose,
}: ReservationDetailModalProps) {
  // Don't show anything if no reservation is selected
  if (!reservation) {
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
            <Text style={styles.title}>Reservation Details</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>


          <View style={styles.details}>
            <Text style={styles.label}>Reservation Number:</Text>
            <Text style={styles.value}>{reservation.reservationNumber}</Text>

            <Text style={styles.label}>Restaurant Name:</Text>
            <Text style={styles.value}>{reservation.resturantName}</Text>

            <Text style={styles.label}>Date:</Text>
            <Text style={styles.value}>{formatDate(reservation.reservationDate)}</Text>

            <Text style={styles.label}>Time:</Text>
            <Text style={styles.value}>{formatTime(reservation.reservationTime)}</Text>

            <Text style={styles.label}>Adults:</Text>
            <Text style={styles.value}>{reservation.adultCount}</Text>

            <Text style={styles.label}>Children:</Text>
            <Text style={styles.value}>{reservation.childCount}</Text>

            <Text style={styles.label}>Total Payment:</Text>
            <Text style={styles.payment}>Rs. {reservation.payment}</Text>
          </View>

          {/* Close button at bottom */}
          <TouchableOpacity style={styles.closeButtonBottom} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Dark semi-transparent background
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // White popup box
  popup: {
    backgroundColor: '#fff',
    borderRadius: 15,
    width: '100%',
    maxWidth: 400,
    padding: 20,
  },
  // Header row
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  // Title text
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  // X close button
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  // Container for all details
  details: {
    marginBottom: 20,
  },
  // Label text (left side)
  label: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  // Value text (right side)
  value: {
    fontSize: 16,
    color: '#000',
    marginBottom: 8,
  },
  // Payment value (special styling)
  payment: {
    fontSize: 18,
    color: '#2e7d32',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  // Bottom close button
  closeButtonBottom: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
