import paramiko
from cryptography.hazmat.primitives import serialization as crypto_serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend as crypto_default_backend
import os

def generate_key():
    key = rsa.generate_private_key(
        backend=crypto_default_backend(),
        public_exponent=65537,
        key_size=4096
    )
    private_key = key.private_bytes(
        crypto_serialization.Encoding.PEM,
        crypto_serialization.PrivateFormat.PKCS8,
        crypto_serialization.NoEncryption()
    )
    public_key = key.public_key().public_bytes(
        crypto_serialization.Encoding.OpenSSH,
        crypto_serialization.PublicFormat.OpenSSH
    )
    return private_key, public_key

def main():
    host = "193.106.196.11"
    user = "root"
    password = "aHxV36vnKJjuNE"
    
    print("Generating SSH key pair...")
    priv, pub = generate_key()
    
    # Save private key locally for the user to see and add to GitHub
    with open("github_deploy_key", "wb") as f:
        f.write(priv)
    
    pub_str = pub.decode('utf-8')
    print("SSH keys generated.")
    
    print(f"Adding public key to {host} authorized_keys...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password)
    
    # Ensure .ssh directory exists
    client.exec_command("mkdir -p ~/.ssh && chmod 700 ~/.ssh")
    # Append public key to authorized_keys
    client.exec_command(f'echo "{pub_str}" >> ~/.ssh/authorized_keys')
    client.exec_command("chmod 600 ~/.ssh/authorized_keys")
    
    print("Public key added to server!")
    client.close()
    
    print("\n" + "="*50)
    print("IMPORTANT: Copy the content of 'github_deploy_key' and add it to GitHub Secrets.")
    print("="*50)

if __name__ == "__main__":
    main()
