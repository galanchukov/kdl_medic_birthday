import os
import paramiko
from scp import SCPClient

def create_ssh_client(server, user, password):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(server, username=user, password=password)
    return client

def main():
    host = "193.106.196.11"
    user = "root"
    password = "aHxV36vnKJjuNE"
    
    remote_base = "/root/kdl_bd"
    
    print(f"Connecting to {host}...")
    ssh = create_ssh_client(host, user, password)
    
    # Create remote directories
    ssh.exec_command(f"mkdir -p {remote_base}/server/src")
    ssh.exec_command(f"mkdir -p {remote_base}/server/prisma")
    
    # CLEAN UP existing node_modules on server
    print("Cleaning up old files on server...")
    ssh.exec_command(f"rm -rf {remote_base}/server/node_modules")
    
    with SCPClient(ssh.get_transport()) as scp:
        # Upload root files
        scp.put("docker-compose.yml", remote_path=f"{remote_base}/docker-compose.yml")
        scp.put("setup_vps.sh", remote_path=f"{remote_base}/setup_vps.sh")
        
        # Upload server files
        server_files = ["package.json", "package-lock.json", "Dockerfile", ".env.example", ".dockerignore", "doctors.json"]
        for f in server_files:
            if os.path.exists(f"server/{f}"):
                scp.put(f"server/{f}", remote_path=f"{remote_base}/server/{f}")
            
        # Upload src
        for f in os.listdir("server/src"):
            scp.put(f"server/src/{f}", remote_path=f"{remote_base}/server/src/{f}")
            
        # Upload prisma
        for f in os.listdir("server/prisma"):
            scp.put(f"server/prisma/{f}", remote_path=f"{remote_base}/server/prisma/{f}")
    
    print("Upload complete!")
    ssh.close()

if __name__ == "__main__":
    main()
