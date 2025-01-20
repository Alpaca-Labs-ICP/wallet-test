import { useState, useRef } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { ThemedView } from "@/components/ThemedView";
import { Principal } from "@dfinity/principal";
import { AccountIdentifier } from "@dfinity/ledger-icp";
import { Actor, HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { useWallet } from "@/context/WalletContext";
import { ApprovalModal } from "@/components/ApprovalModal";

// ICP Ledger canister ID
const LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// Interface for the Ledger canister
const ledgerIDL = ({ IDL }: { IDL: any }) => {
  const AccountIdentifier = IDL.Vec(IDL.Nat8);
  const Tokens = IDL.Record({ e8s: IDL.Nat64 });
  const TransferArgs = IDL.Record({
    to: AccountIdentifier,
    fee: Tokens,
    memo: IDL.Nat64,
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Record({ timestamp_nanos: IDL.Nat64 })),
    amount: Tokens,
  });

  return IDL.Service({
    account_balance: IDL.Func(
      [IDL.Record({ account: AccountIdentifier })],
      [Tokens],
      ["query"]
    ),
    transfer: IDL.Func([TransferArgs], [IDL.Record({ height: IDL.Nat64 })], []),
  });
};

interface Tokens {
  e8s: bigint;
}

export default function BrowserScreen() {
  const { identities, currentIndex, addApprovalRequest } = useWallet();
  const [url, setUrl] = useState("https://icp-1.tiiny.site");
  const [currentUrl, setCurrentUrl] = useState("https://icp-1.tiiny.site");
  const [webViewKey, setWebViewKey] = useState(0);
  const webViewRef = useRef<WebView>(null);

  const fetchBalance = async (identity: Ed25519KeyIdentity) => {
    try {
      const agent = new HttpAgent({
        host: "https://ic0.app",
        identity,
      });

      const ledger = Actor.createActor(ledgerIDL, {
        agent,
        canisterId: LEDGER_CANISTER_ID,
      });

      const principal = identity.getPrincipal();
      const accountId = AccountIdentifier.fromPrincipal({
        principal,
      });

      const balance = (await ledger.account_balance({
        account: accountId.toUint8Array(),
      })) as Tokens;

      return (Number(balance.e8s) / 100000000).toFixed(8);
    } catch (error) {
      console.error("Error fetching balance:", error);
      return "0.00000000";
    }
  };

  const injectedJavaScript = `
    (function() {
      let _isConnected = false;
      let _principal = null;

      window.paca = {
        get isConnected() {
          return _isConnected;
        },
        set isConnected(value) {
          _isConnected = value;
          if (!value) _principal = null;
        },
        get principal() {
          return _principal;
        },
        set principal(value) {
          _principal = value;
        },
        
        requestConnect: async function() {
          return new Promise((resolve) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'CONNECT_WALLET',
              source: 'paca'
            }));
            window.pacaResolve = resolve;
          });
        },

        disconnect: function() {
          this.isConnected = false;
          this.principal = null;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DISCONNECT_WALLET',
            source: 'paca'
          }));
          return true;
        },

        getPrincipal: function() {
          if (!this.isConnected) {
            throw new Error('Wallet not connected');
          }
          return this.principal;
        },

        getBalance: async function() {
          if (!this.isConnected) {
            throw new Error('Wallet not connected');
          }
          return new Promise((resolve) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'GET_BALANCE',
              source: 'paca'
            }));
            window.pacaBalanceResolve = resolve;
          });
        },

        createActor: async function(canisterId, interfaceFactory) {
          if (!this.isConnected) {
            throw new Error('Wallet not connected');
          }
          // Here we would create an actor with the wallet's identity
          // This is a placeholder for now
          return null;
        },

        requestTransfer: async function(recipient, amount) {
          if (!this.isConnected) {
            throw new Error('Wallet not connected');
          }
          return new Promise((resolve) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'REQUEST_TRANSFER',
              source: 'paca',
              data: {
                recipient,
                amount
              }
            }));
            window.pacaTransferResolve = resolve;
          });
        },

        requestSignMessage: async function(message) {
          if (!this.isConnected) {
            throw new Error('Wallet not connected');
          }
          return new Promise((resolve) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'REQUEST_SIGN',
              source: 'paca',
              data: {
                message
              }
            }));
            window.pacaSignResolve = resolve;
          });
        }
      };

      // Declare global type
      if (window.ic === undefined) {
        window.ic = {};
      }
      
      // Create a proxy to ensure both window.paca and window.ic.paca share the same state
      window.ic.paca = new Proxy(window.paca, {
        get: function(target, prop) {
          return target[prop];
        },
        set: function(target, prop, value) {
          target[prop] = value;
          return true;
        }
      });
    })();
    true;
  `;

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.source !== "paca") return;

      const origin = new URL(currentUrl).origin;

      switch (data.type) {
        case "CONNECT_WALLET": {
          if (identities.length === 0) {
            webViewRef.current?.injectJavaScript(`
              window.paca.isConnected = false;
              window.pacaResolve && window.pacaResolve({ 
                connected: false,
                message: "No wallet available"
              });
            `);
            return;
          }

          addApprovalRequest(
            {
              type: "connect",
              data: {},
              origin,
            },
            (approved) => {
              if (approved) {
                const principal = Principal.from(
                  identities[currentIndex].getPrincipal()
                ).toText();

                webViewRef.current?.injectJavaScript(`
                  window.paca.isConnected = true;
                  window.paca.principal = "${principal}";
                  window.pacaResolve && window.pacaResolve({ 
                    connected: true,
                    principal: "${principal}"
                  });
                `);
              } else {
                webViewRef.current?.injectJavaScript(`
                  window.paca.isConnected = false;
                  window.paca.principal = null;
                  window.pacaResolve && window.pacaResolve({ 
                    connected: false,
                    message: "User rejected connection"
                  });
                `);
              }
            }
          );
          break;
        }

        case "GET_BALANCE": {
          if (identities.length === 0) {
            throw new Error("No wallet connected");
          }
          const balance = await fetchBalance(identities[currentIndex]);
          webViewRef.current?.injectJavaScript(`
            window.pacaBalanceResolve && window.pacaBalanceResolve("${balance}");
          `);
          break;
        }

        case "REQUEST_TRANSFER": {
          addApprovalRequest(
            {
              type: "transfer",
              data: data.data,
              origin,
            },
            (approved) => {
              try {
                if (approved) {
                  // Implement actual transfer logic here
                  const script = `
                    try {
                      window.pacaTransferResolve && window.pacaTransferResolve({
                        success: true,
                        message: "Transfer approved"
                      });
                    } catch(e) {
                      console.error("Error in transfer resolve:", e);
                    }
                  `;
                  setTimeout(() => {
                    if (webViewRef.current) {
                      webViewRef.current.injectJavaScript(script);
                    }
                  }, 100);
                } else {
                  const script = `
                    try {
                      window.pacaTransferResolve && window.pacaTransferResolve({
                        success: false,
                        message: "Transfer rejected"
                      });
                    } catch(e) {
                      console.error("Error in transfer reject:", e);
                    }
                  `;
                  setTimeout(() => {
                    if (webViewRef.current) {
                      webViewRef.current.injectJavaScript(script);
                    }
                  }, 100);
                }
              } catch (error) {
                console.error("Error in transfer callback:", error);
                const script = `
                  try {
                    window.pacaTransferResolve && window.pacaTransferResolve({
                      success: false,
                      message: "Transfer failed"
                    });
                  } catch(e) {
                    console.error("Error in transfer error:", e);
                  }
                `;
                setTimeout(() => {
                  if (webViewRef.current) {
                    webViewRef.current.injectJavaScript(script);
                  }
                }, 100);
              }
            }
          );
          break;
        }

        case "REQUEST_SIGN": {
          addApprovalRequest(
            {
              type: "sign",
              data: data.data,
              origin,
            },
            (approved) => {
              try {
                if (approved) {
                  // Implement actual signing logic here
                  const script = `
                    try {
                      window.pacaSignResolve && window.pacaSignResolve({
                        success: true,
                        message: "Message signed",
                        signature: "dummy_signature" // Replace with actual signature
                      });
                    } catch(e) {
                      console.error("Error in sign resolve:", e);
                    }
                  `;
                  setTimeout(() => {
                    if (webViewRef.current) {
                      webViewRef.current.injectJavaScript(script);
                    }
                  }, 100);
                } else {
                  const script = `
                    try {
                      window.pacaSignResolve && window.pacaSignResolve({
                        success: false,
                        message: "Signing rejected"
                      });
                    } catch(e) {
                      console.error("Error in sign reject:", e);
                    }
                  `;
                  setTimeout(() => {
                    if (webViewRef.current) {
                      webViewRef.current.injectJavaScript(script);
                    }
                  }, 100);
                }
              } catch (error) {
                console.error("Error in sign callback:", error);
                const script = `
                  try {
                    window.pacaSignResolve && window.pacaSignResolve({
                      success: false,
                      message: "Signing failed"
                    });
                  } catch(e) {
                    console.error("Error in sign error:", e);
                  }
                `;
                setTimeout(() => {
                  if (webViewRef.current) {
                    webViewRef.current.injectJavaScript(script);
                  }
                }, 100);
              }
            }
          );
          break;
        }

        case "DISCONNECT_WALLET":
          webViewRef.current?.injectJavaScript(`
            window.paca.isConnected = false;
            window.paca.principal = null;
          `);
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
      webViewRef.current?.injectJavaScript(`
        window.paca.isConnected = false;
        window.paca.principal = null;
        window.pacaResolve && window.pacaResolve({ 
          connected: false,
          message: "Connection failed"
        });
        window.pacaBalanceResolve && window.pacaBalanceResolve("0");
        window.pacaSignResolve && window.pacaSignResolve({
          success: false,
          message: "Signing failed"
        });
        window.pacaTransferResolve && window.pacaTransferResolve({
          success: false,
          message: "Transfer failed"
        });
      `);
    }
  };

  const handleSubmit = () => {
    let formattedUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      formattedUrl = `https://${url}`;
    }
    setCurrentUrl(formattedUrl);
  };

  const handleRefresh = () => {
    setWebViewKey((prev) => prev + 1);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.urlBar}>
        <TextInput
          style={styles.urlInput}
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={handleSubmit}
          placeholder="Enter URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <IconSymbol name="chevron.right" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>
      <WebView
        ref={webViewRef}
        key={webViewKey}
        style={styles.webview}
        source={{ uri: currentUrl }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
      />
      <ApprovalModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  urlBar: {
    flexDirection: "row",
    padding: 10,
    gap: 10,
    alignItems: "center",
  },
  urlInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  refreshButton: {
    padding: 5,
  },
  webview: {
    flex: 1,
  },
});
