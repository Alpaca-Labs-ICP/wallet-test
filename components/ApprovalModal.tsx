import React, { useCallback, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useWallet } from "@/context/WalletContext";

export function ApprovalModal() {
  const { approvalRequests, resolveApprovalRequest } = useWallet();

  const currentRequest = useMemo(
    () => (approvalRequests.length > 0 ? approvalRequests[0] : null),
    [approvalRequests]
  );

  const handleApprove = useCallback(() => {
    if (!currentRequest) return;
    const requestId = currentRequest.id;
    // Use requestAnimationFrame instead of setTimeout for better timing
    requestAnimationFrame(() => {
      try {
        resolveApprovalRequest(requestId, true);
      } catch (error) {
        console.error("Error handling approval:", error);
      }
    });
  }, [currentRequest, resolveApprovalRequest]);

  const handleReject = useCallback(() => {
    if (!currentRequest) return;
    const requestId = currentRequest.id;
    // Use requestAnimationFrame instead of setTimeout for better timing
    requestAnimationFrame(() => {
      try {
        resolveApprovalRequest(requestId, false);
      } catch (error) {
        console.error("Error handling rejection:", error);
      }
    });
  }, [currentRequest, resolveApprovalRequest]);

  const renderContent = useCallback(() => {
    if (!currentRequest) return <ActivityIndicator />;

    switch (currentRequest.type) {
      case "transfer":
        return (
          <>
            <Text style={styles.title}>Transfer Request</Text>
            <Text style={styles.description}>
              {currentRequest.origin} is requesting to transfer:
            </Text>
            <Text style={styles.amount}>{currentRequest.data.amount} ICP</Text>
            <Text style={styles.description}>to</Text>
            <Text style={styles.address}>{currentRequest.data.recipient}</Text>
          </>
        );

      case "connect":
        return (
          <>
            <Text style={styles.title}>Connection Request</Text>
            <Text style={styles.description}>
              {currentRequest.origin} is requesting to connect to your wallet
            </Text>
          </>
        );

      case "sign":
        return (
          <>
            <Text style={styles.title}>Signature Request</Text>
            <Text style={styles.description}>
              {currentRequest.origin} is requesting to sign a message:
            </Text>
            <Text style={styles.message}>{currentRequest.data.message}</Text>
          </>
        );

      default:
        return <ActivityIndicator />;
    }
  }, [currentRequest]);

  if (!currentRequest) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={true}
      onRequestClose={handleReject}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          {renderContent()}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={handleReject}
            >
              <Text style={styles.buttonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.approveButton]}
              onPress={handleApprove}
            >
              <Text style={styles.buttonText}>Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalView: {
    margin: 20,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: "90%",
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 15,
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 10,
  },
  amount: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#007AFF",
    marginVertical: 10,
  },
  address: {
    fontSize: 14,
    backgroundColor: "#f5f5f5",
    padding: 10,
    borderRadius: 8,
    marginVertical: 10,
    width: "100%",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    backgroundColor: "#f5f5f5",
    padding: 10,
    borderRadius: 8,
    marginVertical: 10,
    width: "100%",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 20,
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    padding: 15,
    elevation: 2,
    alignItems: "center",
  },
  approveButton: {
    backgroundColor: "#007AFF",
  },
  rejectButton: {
    backgroundColor: "#FF3B30",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },
});
