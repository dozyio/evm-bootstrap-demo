import Head from "next/head";
import React, { useEffect, useState } from "react";
import { createLibp2p, Libp2p } from "libp2p";
import { webRTC } from "@libp2p/webrtc";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { evmbootstrap } from "libp2p-evm-bootstrap";
import { identify } from "@libp2p/identify";
import { kadDHT } from "@libp2p/kad-dht";
import { ping } from "@libp2p/ping";
import { webSockets } from "@libp2p/websockets";
import { all } from "@libp2p/websockets/filters";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { webTransport } from "@libp2p/webtransport";
import type { PeerId } from '@libp2p/interface';
import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
}

export default function Home() {
  const [peerId, setPeerId] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [connections, setConnections] = useState<string[]>([]);
  const [libp2pNode, setLibp2pNode] = useState<Libp2p | null>(null);

  useEffect(() => {
    const client = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev', { filterAddrs: ['webtransport', 'webrtc-direct', 'wss'] })

    const initEthereum = async () => {
      if (!window.ethereum) {
        alert('Ethereum wallet not detected. Please install MetaMask or another Web3 wallet.');
        return;
      }

      try {
        // Request wallet connection
        await window.ethereum.request({ method: 'eth_requestAccounts' });

        // Attempt to switch to Sepolia
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }] // Sepolia
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (switchError: any) {
        // If Sepolia is not added, request to add it
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia Testnet',
                rpcUrls: ['https://rpc.sepolia.org'] /* Add other fallback URLs if needed */,
                nativeCurrency: {
                  name: 'Sepolia ETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                blockExplorerUrls: ['https://sepolia.etherscan.io']
              }]
            });
          } catch (addError) {
            console.error('Error adding Sepolia network:', addError);
            alert('Please add the Sepolia network manually.');
            return;
          }
        } else {
          console.error('Error switching network:', switchError);
          alert('Failed to switch to Sepolia network.');
          return;
        }
      }
    }

    const initLibp2p = async () => {
      try {
        // Create libp2p node
        const node = await createLibp2p({
          addresses: {
            listen: [
              '/p2p-circuit',
              '/webrtc'
            ]
          },
          transports: [
            webSockets({ filter: all }),
            webTransport(),
            webRTC(),
            circuitRelayTransport(),
          ],
          connectionEncrypters: [
            noise()
          ],
          connectionManager: {
            maxConnections: 50
          },
          streamMuxers: [
            yamux(),
          ],
          peerDiscovery: [
            evmbootstrap({
              contractAddress: '0xfef23139179004d7d636a1e66316e42085640262',
              contractIndex: '0x3ad5a918f803de563a7c5327d6cc1fb083cce9c6',
              chainId: BigInt(11155111),
              ethereum: window.ethereum
            })
          ],
          services: {
            identify: identify(),
            kadDHT: kadDHT(),
            ping: ping(),
            delegatedRouting: () => client
          }
        });

        setLibp2pNode(node);

        // Set peer ID
        setPeerId(node.peerId.toString());

        // Listen for peer connections
        node.addEventListener('peer:connect', (evt: CustomEvent<PeerId>) => {
          console.log('Connected to peer:', evt.detail.toString());
          setIsConnected(true);

          // Get connection details including multiaddrs
          const connections = node.getConnections(evt.detail);
          if (connections.length > 0) {
            const multiaddrs = connections.map(conn => conn.remoteAddr.toString());
            setConnections(prev => [...prev, ...multiaddrs]);
          }
        });

        node.addEventListener('peer:disconnect', (evt: CustomEvent<PeerId>) => {
          console.log('Disconnected from peer:', evt.detail.toString());

          // Remove connections for this peer
          const connections = node.getConnections(evt.detail);
          if (connections.length > 0) {
            const multiaddrs = connections.map(conn => conn.remoteAddr.toString());
            setConnections(prev => prev.filter(addr => !multiaddrs.includes(addr)));
          }

          // Update connection status
          if (node.getConnections().length === 0) {
            setIsConnected(false);
          }
        });

        // Start the node
        await node.start();
        console.log('Libp2p node started with peer ID:', node.peerId.toString());

      } catch (error) {
        console.error('Failed to initialize libp2p:', error);
      }
    };

  const initialize = async () => {
    await initEthereum();
    await initLibp2p();
  };

  initialize();

    // Cleanup on unmount
    return () => {
      if (libp2pNode) {
        libp2pNode.stop();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Head>
        <title>EVM Bootstrap Libp2p Demo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif', backgroundColor: '#ffffff', minHeight: '100vh' }}>
        <main>
          <h1 style={{ color: '#1a1a1a', marginBottom: '2rem' }}>
            EVM Bootstrap Libp2p Demo
          </h1>

          <div style={{
            background: '#e3f2fd',
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid #bbdefb'
          }}>
            <h3 style={{ marginTop: 0, color: '#1565c0' }}>What&apos;s happening?</h3>
            <p style={{ margin: 0, lineHeight: '1.5', color: '#0d47a1' }}>
              This demo creates a libp2p node that retrieves bootstrap peer IDs from a smart contract deployed on Sepolia Testnet.
              The peer IDs are resolved to multiaddrs using delegated routing.
              <br />
              <br />
              Smart contract address: 0xfef23139179004d7d636a1e66316e42085640262
              <br />
              Smart contract index: 0x3ad5a918f803de563a7c5327d6cc1fb083cce9c6
              <br />
              Chain ID: 11155111
              <br />
              <br />
            </p>
          </div>

          <div style={{
            background: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            border: '1px solid #e9ecef'
          }}>
            <h2 style={{ marginTop: 0, color: '#212529' }}>Node Information</h2>

            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#212529' }}>Peer ID:</strong>
              <div style={{
                background: '#ffffff',
                padding: '0.5rem',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                wordBreak: 'break-all',
                border: '1px solid #dee2e6',
                color: '#495057'
              }}>
                {peerId || 'Initializing...'}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#212529' }}>Status:</strong>
              <span style={{
                color: isConnected ? '#198754' : '#dc3545',
                marginLeft: '0.5rem',
                fontWeight: 'bold'
              }}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <div>
              <strong style={{ color: '#212529' }}>Active Connections (Multiaddrs):</strong>
              <div style={{ marginTop: '0.5rem' }}>
                {connections.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                    {connections.map((conn, index) => (
                      <li key={index} style={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        wordBreak: 'break-all',
                        color: '#495057'
                      }}>
                        {conn}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span style={{ color: '#6c757d', fontStyle: 'italic' }}>
                    No active connections
                  </span>
                )}
              </div>
            </div>
          </div>
        <div style={{ padding: "0.5rem 0"}}><a href="https://github.com/dozyio/evm-bootstrap-contract">Contract</a> - <a href="https://github.com/dozyio/libp2p-evm-bootstrap-dapp">DApp source</a> - <a href="https://dozy.io/libp2p-evm-bootstrap-dapp/">DApp site</a><a href="https://github.com/dozyio/js-libp2p-evm-bootstrap">JS Libp2p Library</a> - <a href="https://github.com/dozyio/evm-bootstrap-demo">Demo source</a> <a href="https://dozy.io/evm-bootstrap-demo/">Demo site (this page)</a></div>

        </main>
      </div>
    </>
  );
}
