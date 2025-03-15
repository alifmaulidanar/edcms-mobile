import supabase from "../utils/supabase";
import Icon from 'react-native-vector-icons/FontAwesome';
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Button, Alert, Modal, TouchableOpacity } from "react-native";

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  email?: string;
}

const ForgotPasswordModal = ({ visible, onClose, email }: ForgotPasswordModalProps) => {
  const [inputEmail, setInputEmail] = useState(email);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [step, setStep] = useState(1); // Track step (1: email, 2: OTP, 3: reset password)
  const [otpSent, setOtpSent] = useState(false); // Track OTP sent status
  const [loading, setLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  const toggleConfirmPasswordVisibility = () => {
    setIsConfirmPasswordVisible(!isConfirmPasswordVisible);
  };

  useEffect(() => {
    if (visible && email) {
      setStep(2)
      setInputEmail(email);
    };
  }, [visible, email]);

  const checkIsUserValid = async (email: string) => {
    const { data, status } = await supabase.from("users").select("email").eq("email", email).single();
    if (data == null || status === 406) throw new Error("Email tersebut tidak terdaftar. Pastikan Anda memasukkan email yang digunakan oleh akun Anda.");
    return data;
  };

  const handleSendOtp = async () => {
    if (!inputEmail) {
      Alert.alert("Info", "Silakan isi email Anda.");
      return;
    }
    try {
      setLoading(true);
      await checkIsUserValid(inputEmail);
      const { error } = await supabase.auth.resetPasswordForEmail(inputEmail,
        // { redirectTo: `pastimsedc://login/reset-password?email= + ${encodeURIComponent(inputEmail)}` }
      );
      if (error) throw error;
      setOtpSent(true);
      setStep(2);
      Alert.alert("OTP Terkirim", "Kode OTP telah dikirim ke email Anda.");
    } catch (error: any) {
      Alert.alert("Terjadi Kesalahan", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      Alert.alert("Terjadi Kesalahan", "Silakan masukkan kode OTP.");
      return;
    }
    try {
      if (!inputEmail) throw new Error("Silakan isi email Anda");
      setLoading(true);
      const { error } = await supabase.auth.verifyOtp({ email: inputEmail || "", token: otp, type: "email" });
      if (error) throw error;
      setStep(3);
      setOtpVerified(true);
      // Alert.alert("OTP Verified", "Kode OTP berhasil diverifikasi.");
    } catch (error: any) {
      if (error.code == "otp_expired" || error.status == 403 || error.status == 406) {
        Alert.alert("Kode OTP Tidak Valid", "Kode OTP sudah kadaluarsa. Silakan coba kirim ulang.");
      } else {
        Alert.alert("Terjadi Kesalahan", error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      Alert.alert("Terjadi Kesalahan", "Password and konfirmasi password tidak cocok atau tidak valid.");
      return;
    }
    if (newPassword.length < 8 || !/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
      Alert.alert("Terjadi Kesalahan", "Password harus minimal 8 karakter dan mengandung huruf serta angka.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setInputEmail("");
      setOtp("");
      setOtpSent(false);
      setOtpVerified(false);
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Sukses Ganti Password", "Password Anda telah berhasil diubah.");
      onClose();
      setStep(1);
    } catch (error: any) {
      Alert.alert("Terjadi Kesalahan", error.message);
    } finally {
      setLoading(false);
    }
  };

  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleOTPChange = (text: any, index: any) => {
    const otpArray = [...otp];
    otpArray[index] = text;
    setOtp(otpArray.join(''));
    if (text && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleBackspace = (index: any) => {
    if (index > 0) inputRefs.current[index - 1]?.focus();
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} transparent={true}>
      <View className="items-center justify-center flex-1 bg-black bg-opacity-50">
        <View className="p-8 bg-white rounded-lg w-96">
          {/* Step 1: Input Email */}
          {step === 1 && (
            <View>
              <Text className="text-center text-xl font-bold text-[#84439b] mb-6">Reset Password</Text>
              <Text className="mb-6 text-center text-md">Silakan isi email yg digunakan oleh akun Anda untuk mengganti password-nya. Jika Anda lupa email yang Anda gunakan, silakan hubungi Admin.</Text>
              <Text className="mb-2 text-md">Email:</Text>
              <TextInput
                placeholder="Masukkan Email Anda"
                value={inputEmail}
                onChangeText={setInputEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                className="p-3 mb-4 bg-white border border-gray-300 rounded-md"
              />
              <Button
                title="Kirim OTP ke Email"
                onPress={handleSendOtp}
                color="#84439b"
                disabled={loading || !inputEmail}
              />
              {/* {otpSent && (
              <TouchableOpacity onPress={() => setStep(2)} className="w-full px-4 py-3 mt-4 bg-white border border-[#84439b] rounded-lg">
                <Text className="text-center text-[#84439b]">Selanjutnya</Text>
              </TouchableOpacity>
              )} */}
            </View>
          )}

          {/* Step 2: Input OTP */}
          {step === 2 && (
            <View>
              <Text className="text-center text-xl font-bold text-[#84439b] mb-6">Masukkan OTP</Text>

              {/* OTP Inputs */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <TextInput
                    key={index}
                    maxLength={1}
                    keyboardType="numeric"
                    ref={(ref) => inputRefs.current[index] = ref} // Create a reference for each input
                    value={otp[index] || ''}
                    onChangeText={(text) => handleOTPChange(text, index)}
                    onKeyPress={(e) => {
                      if (e.nativeEvent.key === 'Backspace') {
                        handleBackspace(index);
                      }
                    }}
                    style={{
                      width: 40,
                      height: 40,
                      textAlign: 'center',
                      borderWidth: 1,
                      borderColor: '#ccc',
                      borderRadius: 5,
                      marginHorizontal: 2,
                      fontSize: 18,
                    }}
                  />
                ))}
              </View>
              <Button
                title="Verifikasi OTP"
                onPress={handleVerifyOtp}
                color="#84439b"
                disabled={loading || otp.length < 6}
              />
              {/* <TouchableOpacity onPress={() => setStep(1)} className="w-full px-4 py-3 mt-4 bg-white border border-[#84439b] rounded-lg">
                <Text className="text-center text-[#84439b]">Kembali ke Email</Text>
              </TouchableOpacity>
              {otpVerified && (
                <TouchableOpacity onPress={() => setStep(3)} className="w-full px-4 py-3 mt-4 bg-white border border-[#84439b] rounded-lg">
                  <Text className="text-center text-[#84439b]">Selanjutnya</Text>
                </TouchableOpacity>
              )} */}
            </View>
          )}

          {/* Step 3: Reset Password */}
          {step === 3 && (
            <View>
              <Text className="text-center text-xl font-bold text-[#84439b] mb-6">Buat Password Baru</Text>
              <Text className="mb-6 text-center text-md">Password minimal 8 karakter dengan kombinasi huruf dan angka.</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  placeholder="Password Baru"
                  secureTextEntry={!isPasswordVisible}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  className="p-3 mb-4 bg-white border border-gray-300 rounded-md"
                />

                {/* Eye icon for showing/hiding password */}
                <TouchableOpacity
                  onPress={togglePasswordVisibility}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 12,
                  }}
                >
                  <Icon
                    name={isPasswordVisible ? 'eye-slash' : 'eye'}  // Eye icon changes based on visibility
                    size={20}
                    color="#84439b"
                  />
                </TouchableOpacity>
              </View>

              {/* Confirm Password Input */}
              <View style={{ position: 'relative' }}>
                <TextInput
                  placeholder="Konfirmasi Password Baru"
                  secureTextEntry={!isConfirmPasswordVisible}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  className="p-3 mb-4 bg-white border border-gray-300 rounded-md"
                />

                {/* Eye icon for showing/hiding confirm password */}
                <TouchableOpacity
                  onPress={toggleConfirmPasswordVisibility}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: 12,
                  }}
                >
                  <Icon
                    name={isConfirmPasswordVisible ? 'eye-slash' : 'eye'}
                    size={20}
                    color="#84439b"
                  />
                </TouchableOpacity>
              </View>
              <Button
                title="Reset Password"
                onPress={handleResetPassword}
                color="#84439b"
                disabled={loading}
              />
              {/* <TouchableOpacity onPress={() => setStep(2)} className="w-full px-4 py-3 mt-4 bg-white border border-[#84439b] rounded-lg">
                <Text className="text-center text-[#84439b]">Kembali ke OTP</Text>
              </TouchableOpacity> */}
            </View>
          )}

          {/* Close Modal Button */}
          <TouchableOpacity onPress={onClose} className="w-full px-4 py-3 mt-4 bg-white border border-[#84439b] rounded-lg">
            <Text className="text-center text-[#84439b]">Tutup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default ForgotPasswordModal;
